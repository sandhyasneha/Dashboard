-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-008 and patch-011 first.
-- 1. "Hold all sending": one switch that stops every campaign email. It starts ON, matching the current hold.
-- 2. Automatic reminders for people who registered but never started a return, and people who started one but never paid.
-- No new tables: new columns on settings, a new campaign kind, and one function (given to the app's server only).

alter table settings add column if not exists hold_all boolean not null default true;
alter table settings add column if not exists hold_changed_at timestamptz;
alter table settings add column if not exists reminders jsonb;             -- { enabled, daily_cap, steps: { registered: [...], unpaid: [...] } }
alter table settings add column if not exists reminders_last_result text;
alter table settings add column if not exists reminders_last_run timestamptz;

-- Allow the new campaign kind 'reminder' (drops whatever the old kind check was called, then re-adds it).
do $$ declare r record; begin
  for r in select conname from pg_constraint
           where conrelid = 'campaigns'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%kind%'
  loop execute format('alter table campaigns drop constraint %I', r.conname); end loop;
end $$;
alter table campaigns add constraint campaigns_kind_check check (kind in ('prospect', 'renewal', 'reminder'));

-- Who qualifies today. p_group 'registered': signed up 1 to 60 days ago and has no return at all.
-- p_group 'unpaid': has a draft return in p_tax_year started 1 to 60 days ago, and nothing paid in that tax year.
-- Unsubscribed, bounced and complained addresses are never included. Each person is reminded once per campaign.
create or replace function reminder_candidates(p_group text, p_tax_year int)
returns table(email text, phone text) language sql stable as $$
  with paid as (select distinct lower(email) em from ttp_filings where paid_at is not null and tax_year = p_tax_year and email is not null),
  anyf as (select distinct lower(email) em from ttp_filings where email is not null),
  cand as (
    select lower(u.email) em, max(u.phone) phone from ttp_users u
    where p_group = 'registered' and u.email like '%@%'
      and u.registered_at <= now() - interval '1 day' and u.registered_at >= now() - interval '60 days'
      and lower(u.email) not in (select em from anyf)
    group by 1
    union
    select lower(f.email), null from ttp_filings f
    where p_group = 'unpaid' and f.email like '%@%' and f.status_id = 1 and f.tax_year = p_tax_year
      and f.created_at <= now() - interval '1 day' and f.created_at >= now() - interval '60 days'
      and lower(f.email) not in (select em from paid)
  )
  select c.em, max(c.phone) from cand c
  where not exists (select 1 from suppressions s where s.email = c.em)
    and not exists (select 1 from leads l where l.email = c.em and l.status in ('unsubscribed', 'bounced', 'complained'))
  group by c.em
$$;

-- Adds today's qualifying people to a reminder campaign. Returns how many were added.
-- Their lead status is left alone (they are customers), so this never affects prospect campaigns.
create or replace function enroll_reminders(p_campaign_id uuid, p_group text, p_tax_year int)
returns int language plpgsql as $$
declare v int;
begin
  insert into leads (email, phone, carrier_type, source_file, is_customer, status)
  select c.email, c.phone, 'Registered user', 'reminders', true, 'customer' from reminder_candidates(p_group, p_tax_year) c
  on conflict (email) do nothing;
  with ins as (
    insert into enrollments (campaign_id, lead_id, next_send_at)
    select p_campaign_id, l.id, now() from reminder_candidates(p_group, p_tax_year) c join leads l on l.email = c.email
    on conflict (campaign_id, lead_id) do nothing
    returning lead_id
  )
  select count(*) into v from ins;
  return v;
end $$;

revoke all on function reminder_candidates(text, int) from public, anon, authenticated;
revoke all on function enroll_reminders(uuid, text, int) from public, anon, authenticated;
grant execute on function reminder_candidates(text, int) to service_role;
grant execute on function enroll_reminders(uuid, text, int) to service_role;

-- Check: the hold, and who would get a reminder today.
select hold_all as sending_on_hold from settings where id = 1;
select 'registered, no return' as reminder, count(*) from reminder_candidates('registered', 2026)
union all select 'started, not paid (TY2026-27)', count(*) from reminder_candidates('unpaid', 2026);
