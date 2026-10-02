-- Run once in the Supabase SQL editor (safe to re-run).

-- Chip counts for the campaign builder (a plain select is capped at 1,000 rows).
create or replace function lead_facets()
returns table(kind text, label text, n int) language sql stable as $$
  select 'state'::text, state, count(*)::int from leads where status = 'new' and is_customer = false and state is not null group by state
  union all
  select 'type'::text, carrier_type, count(*)::int from leads where status = 'new' and is_customer = false and carrier_type is not null group by carrier_type
  union all
  select 'total'::text, 'all'::text, count(*)::int from leads where status = 'new' and is_customer = false
$$;

-- Enroll matching leads in one statement. A blank filter means "no limit", so customers whose truck count or state is unknown are still included.
create or replace function enroll_campaign(p_campaign_id uuid)
returns int language plpgsql as $$
declare c campaigns%rowtype; v int;
begin
  select * into c from campaigns where id = p_campaign_id;
  with picked as (
    select l.id from leads l
    where l.status = 'new' and l.is_customer = false
      and (c.filter_min_units is null or l.power_units >= c.filter_min_units)
      and (c.filter_max_units is null or l.power_units <= c.filter_max_units)
      and (coalesce(array_length(c.filter_states, 1), 0) = 0 or l.state = any(c.filter_states))
      and (coalesce(array_length(c.filter_carrier_types, 1), 0) = 0 or l.carrier_type = any(c.filter_carrier_types))
  ), ins as (
    insert into enrollments (campaign_id, lead_id, next_send_at)
    select p_campaign_id, id, now() from picked
    on conflict (campaign_id, lead_id) do nothing
    returning lead_id
  )
  update leads set status = 'in_sequence', updated_at = now() where id in (select lead_id from ins);
  get diagnostics v = row_count;
  return v;
end $$;

-- Stable ordering so the lapsed list can be paged.
create or replace function dash_lapsed(p_prev int, p_curr int)
returns table(email text, name text, phone text, last_filed_at timestamptz, filings_prev int, vehicles int, lead_status text, in_sequence boolean) language sql stable as $$
  with prev as (
    select lower(f.email) email, max(f.completed_at) last_filed_at, count(*)::int filings_prev, sum(f.vehicle_count)::int vehicles
    from ttp_filings f where f.status_id = 4 and f.tax_year = p_prev and f.email is not null group by 1
  ), curr as (
    select distinct lower(email) email from ttp_filings where status_id = 4 and tax_year = p_curr and email is not null
  )
  select p.email, u.name, u.phone, p.last_filed_at, p.filings_prev, p.vehicles, l.status,
         exists(select 1 from enrollments e where e.lead_id = l.id and e.status = 'active')
  from prev p
  left join curr c on c.email = p.email
  left join (select distinct on (lower(email)) lower(email) em, name, phone from ttp_users order by lower(email), registered_at desc) u on u.em = p.email
  left join leads l on l.email = p.email
  where c.email is null order by p.last_filed_at desc, p.email
$$;

create or replace function dash_retention_counts(p_prev int, p_curr int)
returns table(prev_filers int, returned int) language sql stable as $$
  with prev as (select distinct lower(email) e from ttp_filings where status_id = 4 and tax_year = p_prev and email is not null),
       curr as (select distinct lower(email) e from ttp_filings where status_id = 4 and tax_year = p_curr and email is not null)
  select (select count(*) from prev)::int, (select count(*) from prev p join curr c on c.e = p.e)::int
$$;

create or replace function dash_unique_filers()
returns int language sql stable as $$
  select count(distinct lower(email))::int from ttp_filings where status_id = 4 and email is not null
$$;

-- Renewal campaigns: make sure lapsed customers exist as leads, then enroll them in one statement.
create or replace function enroll_lapsed(p_campaign_id uuid, p_prev int, p_curr int)
returns int language plpgsql as $$
declare v int;
begin
  insert into leads (email, company_name, phone, carrier_type, source_file)
  select d.email, d.name, d.phone, 'Returning customer', 'lapsed TY' || p_prev
  from dash_lapsed(p_prev, p_curr) d
  on conflict (email) do nothing;
  with picked as (
    select l.id from dash_lapsed(p_prev, p_curr) d join leads l on l.email = d.email
    where not d.in_sequence and l.status not in ('unsubscribed', 'bounced', 'complained')
  ), ins as (
    insert into enrollments (campaign_id, lead_id, next_send_at)
    select p_campaign_id, id, now() from picked
    on conflict (campaign_id, lead_id) do nothing
    returning lead_id
  )
  select count(*) into v from ins;
  return v;
end $$;
