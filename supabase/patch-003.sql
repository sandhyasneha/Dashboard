-- Run once in the Supabase SQL editor (safe to re-run). Adds scheduling and "first N contacts".

alter table campaigns add column if not exists scheduled_at timestamptz;

-- Allow the new 'scheduled' status (drops whatever the old status check was called, then re-adds it).
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'campaigns'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  loop execute format('alter table campaigns drop constraint %I', r.conname); end loop;
end $$;
alter table campaigns add constraint campaigns_status_check check (status in ('draft','scheduled','running','paused','completed'));

-- Enrolment with an optional cap on how many contacts to include (phased roll-outs while the sending domain warms up).
drop function if exists enroll_campaign(uuid);
create or replace function enroll_campaign(p_campaign_id uuid, p_limit int default null)
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
