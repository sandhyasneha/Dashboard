-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-014 first.
-- Lists become labels: a contact can be in several lists. Importing a file puts EVERY address in it into that file's list,
-- including addresses already on file, so a campaign can target exactly the people in that file.
-- No new tables: a new column on leads, a trigger, and functions given to the app's server only.

alter table leads add column if not exists lists text[] not null default '{}';
update leads set lists = array[carrier_type] where carrier_type is not null and lists = '{}';
create index if not exists leads_lists_idx on leads using gin (lists);

-- Contacts added by the sync, the reminders or renewals get their usual list (carrier_type) as their first label.
create or replace function leads_default_list() returns trigger language plpgsql as $$
begin
  if (new.lists is null or new.lists = '{}') and new.carrier_type is not null then new.lists := array[new.carrier_type]; end if;
  return new;
end $$;
drop trigger if exists leads_default_list on leads;
create trigger leads_default_list before insert on leads for each row execute function leads_default_list();

-- Adds the addresses to a list (keeping any lists they are already in). Returns how many were added.
create or replace function add_leads_to_list(p_emails text[], p_list text)
returns int language plpgsql as $$
declare v int;
begin
  update leads set lists = array_append(lists, p_list), updated_at = now()
  where email = any(p_emails) and not (p_list = any(lists));
  get diagnostics v = row_count;
  return v;
end $$;

-- Builder counts, by list label. A contact in two lists is counted in both, and once in the total.
drop function if exists lead_facets(boolean);
create function lead_facets(p_skip_emailed boolean default true)
returns table(kind text, label text, n int) language sql stable as $$
  with pool as (
    select l.state, l.lists from leads l
    where l.status = 'new' and l.is_customer = false
      and (not p_skip_emailed or not exists (select 1 from messages m where m.lead_id = l.id))
  )
  select 'state'::text, state, count(*)::int from pool where state is not null group by state
  union all
  select 'type'::text, t, count(*)::int from pool, unnest(pool.lists) t group by t
  union all
  select 'total'::text, 'all'::text, count(*)::int from pool
$$;

-- How many contacts each list holds in total (any status), for the Leads page and the builder.
create or replace function list_sizes()
returns table(label text, n int) language sql stable as $$
  select t, count(*)::int from leads, unnest(leads.lists) t group by t order by t
$$;

-- Enrolment: the lists chosen in the builder now match any label a contact has.
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
      and (coalesce(array_length(c.filter_carrier_types, 1), 0) = 0 or l.lists && c.filter_carrier_types)
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

revoke all on function add_leads_to_list(text[], text) from public, anon, authenticated;
revoke all on function lead_facets(boolean) from public, anon, authenticated;
revoke all on function list_sizes() from public, anon, authenticated;
revoke all on function enroll_campaign(uuid, int, boolean) from public, anon, authenticated;
grant execute on function add_leads_to_list(text[], text) to service_role;
grant execute on function lead_facets(boolean) to service_role;
grant execute on function list_sizes() to service_role;
grant execute on function enroll_campaign(uuid, int, boolean) to service_role;

-- Check: each list and how many contacts it holds.
select * from list_sizes();
