-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-003 first.
-- "Skip contacts who already received a campaign email" (on by default) for new campaigns.
-- A contact counts as emailed once any campaign email was actually sent to them (the messages table). Test emails do not count.
-- No new tables. The two functions are given to the app's server only.

alter table campaigns add column if not exists skip_emailed boolean not null default true;

-- Counts for the campaign builder. p_skip_emailed true leaves out contacts who were already emailed.
drop function if exists lead_facets();
drop function if exists lead_facets(boolean);
create function lead_facets(p_skip_emailed boolean default true)
returns table(kind text, label text, n int) language sql stable as $$
  with pool as (
    select l.state, l.carrier_type from leads l
    where l.status = 'new' and l.is_customer = false
      and (not p_skip_emailed or not exists (select 1 from messages m where m.lead_id = l.id))
  )
  select 'state'::text, state, count(*)::int from pool where state is not null group by state
  union all
  select 'type'::text, carrier_type, count(*)::int from pool where carrier_type is not null group by carrier_type
  union all
  select 'total'::text, 'all'::text, count(*)::int from pool
$$;

-- Enrolment, now with the skip option. Same rules as before otherwise.
drop function if exists enroll_campaign(uuid);
drop function if exists enroll_campaign(uuid, int);
drop function if exists enroll_campaign(uuid, int, boolean);
create function enroll_campaign(p_campaign_id uuid, p_limit int default null, p_skip_emailed boolean default true)
returns int language plpgsql as $$
declare c campaigns%rowtype; v int;
begin
  select * into c from campaigns where id = p_campaign_id;
  update campaigns set skip_emailed = p_skip_emailed where id = p_campaign_id;
  with picked as (
    select l.id from leads l
    where l.status = 'new' and l.is_customer = false
      and (not p_skip_emailed or not exists (select 1 from messages m where m.lead_id = l.id))
      and (c.filter_min_units is null or l.power_units >= c.filter_min_units)
      and (c.filter_max_units is null or l.power_units <= c.filter_max_units)
      and (coalesce(array_length(c.filter_states, 1), 0) = 0 or l.state = any(c.filter_states))
      and (coalesce(array_length(c.filter_carrier_types, 1), 0) = 0 or l.carrier_type = any(c.filter_carrier_types))
    order by l.created_at, l.id
    limit coalesce(p_limit, 2147483647)
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

revoke all on function lead_facets(boolean) from public, anon, authenticated;
revoke all on function enroll_campaign(uuid, int, boolean) from public, anon, authenticated;
grant execute on function lead_facets(boolean) to service_role;
grant execute on function enroll_campaign(uuid, int, boolean) to service_role;

-- Check: contacts available for a new campaign, with and without the skip.
select (select n from lead_facets(true) where kind = 'total') as available_skipping_emailed,
       (select n from lead_facets(false) where kind = 'total') as available_including_emailed,
       (select count(distinct lead_id) from messages) as contacts_already_emailed;
