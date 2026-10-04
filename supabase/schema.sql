-- TruckTaxPro Campaigns — run this in Supabase SQL editor once.
create extension if not exists pgcrypto;

-- Leads: one row per email. Upserted by the importer.
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  company_name text,
  phone text,
  fleet_type text,
  carrier_type text,
  power_units int,
  state text,
  usdot text,
  source_file text,
  status text not null default 'new'
    check (status in ('new','in_sequence','replied','customer','bounced','unsubscribed','complained')),
  is_customer boolean not null default false,
  customer_registered_at timestamptz,
  customer_filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_state_idx on leads(state);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_created_idx on leads(created_at desc);

-- Campaigns hold a sequence of steps.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  daily_cap int not null default 800,
  send_window_start int not null default 9,   -- hour, America/Chicago
  send_window_end int not null default 17,
  filter_states text[] default '{}',
  filter_carrier_types text[] default '{}',
  filter_min_units int default 1,
  filter_max_units int default 200,
  created_at timestamptz not null default now()
);

create table if not exists campaign_steps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  position int not null,
  subject text not null,
  body_md text not null,           -- supports {{company}}, {{state}}, {{power_units}}
  delay_days int not null default 0, -- days after previous step
  unique (campaign_id, position)
);

-- An enrollment is one lead moving through one campaign.
create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  current_position int not null default 0,   -- last step sent (0 = none yet)
  next_send_at timestamptz,
  status text not null default 'active'
    check (status in ('active','completed','exited_customer','exited_bounce','exited_unsub','exited_reply','paused')),
  created_at timestamptz not null default now(),
  unique (campaign_id, lead_id)
);
create index if not exists enrollments_due_idx on enrollments(status, next_send_at);

-- Every email sent.
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  lead_id uuid not null references leads(id) on delete cascade,
  step_position int,
  resend_id text unique,
  subject text,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_event text
);
create index if not exists messages_campaign_idx on messages(campaign_id, sent_at desc);
create index if not exists messages_lead_idx on messages(lead_id);

-- Raw webhook events (audit trail).
create table if not exists email_events (
  id bigserial primary key,
  resend_id text,
  type text not null,
  payload jsonb,
  received_at timestamptz not null default now()
);

-- Emails we must never send to.
create table if not exists suppressions (
  email text primary key,
  reason text not null check (reason in ('unsubscribed','bounced','complained','manual')),
  created_at timestamptz not null default now()
);

-- Customer events pushed from trucktaxpro.com (or pulled by cron).
create table if not exists customer_events (
  id bigserial primary key,
  email text not null,
  event text not null check (event in ('registered','filed')),
  occurred_at timestamptz not null default now(),
  source text not null default 'webhook'
);
create index if not exists customer_events_email_idx on customer_events(email);

-- App settings (single row).
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  global_daily_cap int not null default 800,
  monthly_cap int not null default 20000,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

-- Helper: mark a lead as customer and exit active enrollments.
create or replace function mark_customer(p_email text, p_event text, p_at timestamptz)
returns void language plpgsql as $$
declare v_lead uuid;
begin
  select id into v_lead from leads where email = lower(p_email);
  if v_lead is null then return; end if;
  update leads set
    is_customer = true,
    status = 'customer',
    customer_registered_at = case when p_event = 'registered' then coalesce(customer_registered_at, p_at) else customer_registered_at end,
    customer_filed_at = case when p_event = 'filed' then coalesce(customer_filed_at, p_at) else customer_filed_at end,
    updated_at = now()
  where id = v_lead;
  update enrollments set status = 'exited_customer' where lead_id = v_lead and status = 'active';
end $$;

-- Daily send count (UTC day) for cap enforcement.
create or replace view sends_today as
  select count(*)::int as n from messages where sent_at >= date_trunc('day', now());
create or replace view sends_this_month as
  select count(*)::int as n from messages where sent_at >= date_trunc('month', now());

-- Campaign stats view used by the UI.
create or replace view campaign_stats as
select c.id as campaign_id,
  (select count(*) from enrollments e where e.campaign_id = c.id) as enrolled,
  (select count(*) from enrollments e where e.campaign_id = c.id and e.status = 'active') as active,
  (select count(*) from messages m where m.campaign_id = c.id) as sent,
  (select count(*) from messages m where m.campaign_id = c.id and m.delivered_at is not null) as delivered,
  (select count(*) from messages m where m.campaign_id = c.id and m.opened_at is not null) as opened,
  (select count(*) from messages m where m.campaign_id = c.id and m.clicked_at is not null) as clicked,
  (select count(*) from messages m where m.campaign_id = c.id and m.bounced_at is not null) as bounced,
  (select count(*) from enrollments e where e.campaign_id = c.id and e.status = 'exited_customer') as converted
from campaigns c;

-- RLS: the app uses the service role on the server; lock tables for anon.
alter table leads enable row level security;
alter table campaigns enable row level security;
alter table campaign_steps enable row level security;
alter table enrollments enable row level security;
alter table messages enable row level security;
alter table suppressions enable row level security;
alter table customer_events enable row level security;
alter table email_events enable row level security;
alter table settings enable row level security;

-- =====================================================================
-- Production mirror (filled by sync/ script running on the InterServer box)
-- =====================================================================
create table if not exists ttp_users (
  user_id int primary key,
  email text not null,
  name text,
  phone text,
  user_type text,
  registered_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists ttp_users_email_idx on ttp_users(lower(email));
create index if not exists ttp_users_reg_idx on ttp_users(registered_at);

create table if not exists ttp_tax_periods (
  id int primary key,
  tax_year int not null,
  start_date date,
  end_date date,
  is_active boolean default false
);

create table if not exists ttp_filings (
  filing_id int primary key,
  user_id int,
  email text,
  filing_number text,
  status_id int,
  status text,
  tax_period_id int,
  tax_year int,
  first_used_month int,
  vehicle_count int,
  total_tax numeric(12,2),
  service_fee numeric(12,2),
  total_payable numeric(12,2),
  created_at timestamptz,
  modified_at timestamptz,
  completed_at timestamptz,         -- modified_at when status_id = 4
  synced_at timestamptz not null default now()
);
create index if not exists ttp_filings_completed_idx on ttp_filings(completed_at);
create index if not exists ttp_filings_ty_idx on ttp_filings(tax_year, status_id);
create index if not exists ttp_filings_email_idx on ttp_filings(lower(email));

create table if not exists sync_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  users_upserted int default 0,
  filings_upserted int default 0,
  marketing_merged int default 0,
  error text
);

alter table ttp_users enable row level security;
alter table ttp_tax_periods enable row level security;
alter table ttp_filings enable row level security;
alter table sync_runs enable row level security;

-- After each sync: mark matching leads as customers and exit sequences.
create or replace function apply_customer_marks()
returns int language plpgsql as $$
declare v int := 0;
begin
  with reg as (
    select l.id, u.registered_at from leads l join ttp_users u on lower(u.email) = l.email where l.is_customer = false
  )
  update leads l set is_customer = true, status = 'customer', customer_registered_at = coalesce(l.customer_registered_at, reg.registered_at), updated_at = now()
  from reg where l.id = reg.id;
  get diagnostics v = row_count;
  update leads l set customer_filed_at = f.completed_at
  from (select lower(email) email, min(completed_at) completed_at from ttp_filings where status_id = 4 group by lower(email)) f
  where l.email = f.email and l.customer_filed_at is null;
  update enrollments e set status = 'exited_customer' from leads l where e.lead_id = l.id and l.is_customer and e.status = 'active';
  return v;
end $$;

-- Dashboard: filings + service-fee revenue by month for a tax year (completed only).
create or replace function dash_filings_by_month(p_tax_year int)
returns table(month date, filed int, revenue numeric, vehicles int) language sql stable as $$
  select date_trunc('month', completed_at)::date, count(*)::int, coalesce(sum(service_fee),0), coalesce(sum(vehicle_count),0)::int
  from ttp_filings where status_id = 4 and tax_year = p_tax_year and completed_at is not null
  group by 1 order by 1
$$;

-- Dashboard: registrations by month.
create or replace function dash_users_by_month()
returns table(month date, registered int) language sql stable as $$
  select date_trunc('month', registered_at)::date, count(*)::int from ttp_users where registered_at is not null group by 1 order by 1
$$;

-- Dashboard: status breakdown for a tax year.
create or replace function dash_status_breakdown(p_tax_year int)
returns table(status text, n int) language sql stable as $$
  select coalesce(status, 'Unknown'), count(*)::int from ttp_filings where tax_year = p_tax_year group by 1 order by 2 desc
$$;

-- Retention: filed in p_prev but not (yet) in p_curr.
create or replace function dash_lapsed(p_prev int, p_curr int)
returns table(email text, name text, phone text, last_filed_at timestamptz, filings_prev int, vehicles int, lead_status text, in_sequence boolean) language sql stable as $$
  with prev as (
    select lower(f.email) email, max(f.completed_at) last_filed_at, count(*)::int filings_prev, sum(f.vehicle_count)::int vehicles
    from ttp_filings f where f.status_id = 4 and f.tax_year = p_prev group by 1
  ), curr as (
    select distinct lower(email) email from ttp_filings where status_id = 4 and tax_year = p_curr
  )
  select p.email, u.name, u.phone, p.last_filed_at, p.filings_prev, p.vehicles, l.status,
         exists(select 1 from enrollments e where e.lead_id = l.id and e.status = 'active')
  from prev p
  left join curr c on c.email = p.email
  left join ttp_users u on lower(u.email) = p.email
  left join leads l on l.email = p.email
  where c.email is null order by p.last_filed_at desc
$$;

-- Campaign kinds: 'prospect' (FMCSA leads; exit when they become a customer) or
-- 'renewal' (existing customers; exit when they complete a return for target_tax_year).
alter table campaigns add column if not exists kind text not null default 'prospect' check (kind in ('prospect','renewal'));
alter table campaigns add column if not exists target_tax_year int;

create or replace function apply_customer_marks()
returns int language plpgsql as $$
declare v int := 0;
begin
  with reg as (
    select l.id, u.registered_at from leads l join ttp_users u on lower(u.email) = l.email where l.is_customer = false
  )
  update leads l set is_customer = true, status = 'customer', customer_registered_at = coalesce(l.customer_registered_at, reg.registered_at), updated_at = now()
  from reg where l.id = reg.id;
  get diagnostics v = row_count;
  update leads l set customer_filed_at = f.completed_at
  from (select lower(email) email, min(completed_at) completed_at from ttp_filings where status_id = 4 group by lower(email)) f
  where l.email = f.email and l.customer_filed_at is null;
  -- Prospect sequences stop when the lead converts.
  update enrollments e set status = 'exited_customer'
  from leads l, campaigns c where e.lead_id = l.id and e.campaign_id = c.id and c.kind = 'prospect' and l.is_customer and e.status = 'active';
  -- Renewal sequences stop when the customer completes this year's return.
  update enrollments e set status = 'exited_customer'
  from leads l, campaigns c where e.lead_id = l.id and e.campaign_id = c.id and c.kind = 'renewal' and e.status = 'active'
    and exists (select 1 from ttp_filings f where lower(f.email) = l.email and f.status_id = 4 and f.tax_year = c.target_tax_year);
  return v;
end $$;
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
-- Run once in the Supabase SQL editor (safe to re-run). Daily limits: 700 normally, 1,000 in May, June and July.
alter table settings add column if not exists peak_daily_cap int not null default 1000;
update settings set global_daily_cap = 700, peak_daily_cap = 1000, monthly_cap = 50000, updated_at = now() where id = 1;
-- Run once in the Supabase SQL editor (safe to re-run). Lets the campaign page show delivered / opened / clicked for TEST emails.
create table if not exists test_sends (
  id uuid primary key default gen_random_uuid(),
  resend_id text unique,
  to_email text not null,
  subject text,
  campaign_id uuid references campaigns(id) on delete set null,
  sent_at timestamptz not null default now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  last_event text
);
create index if not exists test_sends_sent_idx on test_sends(sent_at desc);
alter table test_sends enable row level security;
-- Run once in the Supabase SQL editor (safe to re-run).
-- Revenue and customers now follow PAYMENT, not only IRS completion.
-- A return counts as paid when its status is Paid (2), Submitted (3), Completed (4) or Schedule 1 Ready (6).
-- Draft (1) and Rejected (5) do not count.

-- When it was paid: the filing's last update date (until the payment date itself is read from production).
alter table ttp_filings add column if not exists paid_at timestamptz
  generated always as (case when status_id in (2, 3, 4, 6) then coalesce(modified_at, created_at) end) stored;
create index if not exists ttp_filings_paid_idx on ttp_filings(paid_at);

create or replace function dash_filings_by_month(p_tax_year int)
returns table(month date, filed int, revenue numeric, vehicles int) language sql stable as $$
  select date_trunc('month', paid_at)::date, count(*)::int, coalesce(sum(service_fee), 0), coalesce(sum(vehicle_count), 0)::int
  from ttp_filings where paid_at is not null and tax_year = p_tax_year
  group by 1 order by 1
$$;

create or replace function dash_unique_filers()
returns int language sql stable as $$
  select count(distinct lower(email))::int from ttp_filings where paid_at is not null and email is not null
$$;

create or replace function dash_retention_counts(p_prev int, p_curr int)
returns table(prev_filers int, returned int) language sql stable as $$
  with prev as (select distinct lower(email) e from ttp_filings where paid_at is not null and tax_year = p_prev and email is not null),
       curr as (select distinct lower(email) e from ttp_filings where paid_at is not null and tax_year = p_curr and email is not null)
  select (select count(*) from prev)::int, (select count(*) from prev p join curr c on c.e = p.e)::int
$$;

create or replace function dash_lapsed(p_prev int, p_curr int)
returns table(email text, name text, phone text, last_filed_at timestamptz, filings_prev int, vehicles int, lead_status text, in_sequence boolean) language sql stable as $$
  with prev as (
    select lower(f.email) email, max(f.paid_at) last_filed_at, count(*)::int filings_prev, sum(f.vehicle_count)::int vehicles
    from ttp_filings f where f.paid_at is not null and f.tax_year = p_prev and f.email is not null group by 1
  ), curr as (
    select distinct lower(email) email from ttp_filings where paid_at is not null and tax_year = p_curr and email is not null
  )
  select p.email, u.name, u.phone, p.last_filed_at, p.filings_prev, p.vehicles, l.status,
         exists(select 1 from enrollments e where e.lead_id = l.id and e.status = 'active')
  from prev p
  left join curr c on c.email = p.email
  left join (select distinct on (lower(email)) lower(email) em, name, phone from ttp_users order by lower(email), registered_at desc) u on u.em = p.email
  left join leads l on l.email = p.email
  where c.email is null order by p.last_filed_at desc, p.email
$$;

create or replace function apply_customer_marks()
returns int language plpgsql as $$
declare v int := 0;
begin
  with reg as (
    select l.id, u.registered_at from leads l join ttp_users u on lower(u.email) = l.email where l.is_customer = false
  )
  update leads l set is_customer = true, status = 'customer', customer_registered_at = coalesce(l.customer_registered_at, reg.registered_at), updated_at = now()
  from reg where l.id = reg.id;
  get diagnostics v = row_count;
  update leads l set customer_filed_at = f.paid_at
  from (select lower(email) email, min(paid_at) paid_at from ttp_filings where paid_at is not null group by lower(email)) f
  where l.email = f.email and l.customer_filed_at is null;
  -- Prospect sequences stop when the lead converts.
  update enrollments e set status = 'exited_customer'
  from leads l, campaigns c where e.lead_id = l.id and e.campaign_id = c.id and c.kind = 'prospect' and l.is_customer and e.status = 'active';
  -- Renewal sequences stop when the customer pays for this year's return.
  update enrollments e set status = 'exited_customer'
  from leads l, campaigns c where e.lead_id = l.id and e.campaign_id = c.id and c.kind = 'renewal' and e.status = 'active'
    and exists (select 1 from ttp_filings f where lower(f.email) = l.email and f.paid_at is not null and f.tax_year = c.target_tax_year);
  return v;
end $$;

-- Apply it to the data already synced.
select apply_customer_marks();
-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-006.sql to have been run first.
-- Revenue = what Stripe actually collected (after discounts), in the month it was paid.
-- Source: production PortalFeePayment (+ the coupon in FilingCouponUsage / CouponMaster). Card and gateway fields are never copied.

create table if not exists ttp_payments (
  payment_id int primary key,
  filing_id int,
  amount numeric(12,2) not null default 0,       -- the amount actually collected
  payment_status text,
  paid_on timestamptz,                           -- the payment date (PortalFeePayment.CreatedDate)
  modified_at timestamptz,
  is_deleted boolean not null default false,
  discount_amount numeric(12,2) not null default 0,
  coupon_code text,
  is_paid boolean generated always as (lower(coalesce(payment_status, '')) = 'paid' and not is_deleted) stored,
  synced_at timestamptz not null default now()
);
create index if not exists ttp_payments_filing_idx on ttp_payments(filing_id);
create index if not exists ttp_payments_paid_idx on ttp_payments(paid_on) where is_paid;
alter table ttp_payments enable row level security;

-- Returns paid by month (from the filing status) and revenue by month (from the payments), side by side.
create or replace function dash_filings_by_month(p_tax_year int)
returns table(month date, filed int, revenue numeric, vehicles int) language sql stable as $$
  with f as (
    select date_trunc('month', paid_at)::date m, count(*)::int filed, coalesce(sum(vehicle_count), 0)::int vehicles
    from ttp_filings where paid_at is not null and tax_year = p_tax_year group by 1
  ), r as (
    select date_trunc('month', p.paid_on)::date m, sum(p.amount) revenue
    from ttp_payments p join ttp_filings fl on fl.filing_id = p.filing_id
    where p.is_paid and fl.tax_year = p_tax_year group by 1
  )
  select coalesce(f.m, r.m), coalesce(f.filed, 0), coalesce(r.revenue, 0), coalesce(f.vehicles, 0)
  from f full join r on r.m = f.m order by 1
$$;

-- Collected vs list price vs discounts for a tax year.
create or replace function dash_revenue_summary(p_tax_year int)
returns table(collected numeric, discounts numeric, gross numeric, payments int) language sql stable as $$
  select coalesce(sum(p.amount), 0), coalesce(sum(p.discount_amount), 0), coalesce(sum(p.amount + p.discount_amount), 0), count(*)::int
  from ttp_payments p join ttp_filings fl on fl.filing_id = p.filing_id
  where p.is_paid and fl.tax_year = p_tax_year
$$;

create or replace function dash_coupon_summary(p_tax_year int)
returns table(coupon_code text, uses int, discount_total numeric) language sql stable as $$
  select p.coupon_code, count(*)::int, coalesce(sum(p.discount_amount), 0)
  from ttp_payments p join ttp_filings fl on fl.filing_id = p.filing_id
  where p.is_paid and fl.tax_year = p_tax_year and p.discount_amount > 0
  group by p.coupon_code order by 3 desc
$$;
-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-006 and patch-007 first.
-- Retention by tax year and month, imported past filers, and the monthly renewal settings.

-- Past filers who are not in the system (imported from a file): one row per customer per filing date.
create table if not exists retention_imports (
  id bigserial primary key,
  email text not null,
  filed_on date not null,
  tax_year int generated always as (case when extract(month from filed_on) >= 7 then extract(year from filed_on)::int else extract(year from filed_on)::int - 1 end) stored,
  filed_month int generated always as (extract(month from filed_on)::int) stored,
  source text,
  created_at timestamptz not null default now(),
  unique (email, filed_on)
);
create index if not exists retention_imports_ty_idx on retention_imports(tax_year, filed_month);
alter table retention_imports enable row level security;

-- Settings for the automatic monthly renewals (one row).
create table if not exists retention_auto (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default false,
  mode text not null default 'review' check (mode in ('review', 'auto')),   -- review = a draft for you to send; auto = sends by itself
  send_day int not null default 1 check (send_day between 1 and 28),
  daily_cap int not null default 50,
  steps jsonb,                                                               -- the emails; the app supplies defaults when empty
  last_run_month text,                                                       -- 'YYYY-MM' of the last month a campaign was created
  last_result text,
  updated_at timestamptz not null default now()
);
insert into retention_auto (id) values (1) on conflict do nothing;
alter table retention_auto enable row level security;

alter table campaigns add column if not exists auto_source text;           -- 'retention' for campaigns the monthly job created

-- Who filed in a tax year (optionally in one calendar month), and whether they filed again in the NEXT tax year.
create or replace function retention_cohort(p_tax_year int, p_month int default null)
returns table(email text, name text, phone text, cohort_at timestamptz, filings int, vehicles int, source text,
              returned boolean, returned_at timestamptz, lead_status text, in_sequence boolean)
language sql stable as $$
  with sys as (
    select lower(f.email) as email, min(f.paid_at) as cohort_at, count(*)::int as filings, coalesce(sum(f.vehicle_count), 0)::int as vehicles
    from ttp_filings f
    where f.paid_at is not null and f.tax_year = p_tax_year and f.email is not null
      and (p_month is null or extract(month from f.paid_at)::int = p_month)
    group by lower(f.email)
  ), imp as (
    select lower(i.email) as email, min(i.filed_on)::timestamptz as cohort_at, count(*)::int as filings, 0 as vehicles
    from retention_imports i
    where i.tax_year = p_tax_year and (p_month is null or i.filed_month = p_month)
    group by lower(i.email)
  ), members as (
    select u.email, min(u.cohort_at) as cohort_at, sum(u.filings)::int as filings, sum(u.vehicles)::int as vehicles,
           case when bool_or(u.src = 'system') then 'System' else 'Imported' end as source
    from (select email, cohort_at, filings, vehicles, 'system' as src from sys
          union all
          select email, cohort_at, filings, vehicles, 'import' as src from imp) u
    group by u.email
  ), ret as (
    select lower(f.email) as email, min(f.paid_at) as returned_at
    from ttp_filings f
    where f.paid_at is not null and f.tax_year = p_tax_year + 1 and f.email is not null
    group by lower(f.email)
  )
  select m.email, usr.name, usr.phone, m.cohort_at, m.filings, m.vehicles, m.source,
         (r.email is not null), r.returned_at, l.status,
         coalesce((select true from enrollments e where e.lead_id = l.id and e.status = 'active' limit 1), false)
  from members m
  left join ret r on r.email = m.email
  left join (select distinct on (lower(email)) lower(email) as em, name, phone from ttp_users order by lower(email), registered_at desc) usr on usr.em = m.email
  left join leads l on l.email = m.email
  order by (r.email is not null), m.cohort_at, m.email
$$;

-- One row per month of the tax year (calendar month number), plus month 0 = everyone, counted once.
create or replace function retention_by_month(p_tax_year int)
returns table(month int, cohort int, returned int)
language sql stable as $$
  with members as (
    select lower(f.email) as email, extract(month from f.paid_at)::int as m
    from ttp_filings f where f.paid_at is not null and f.tax_year = p_tax_year and f.email is not null
    group by 1, 2
    union
    select lower(i.email), i.filed_month from retention_imports i where i.tax_year = p_tax_year
  ), ret as (
    select distinct lower(f.email) as email from ttp_filings f
    where f.paid_at is not null and f.tax_year = p_tax_year + 1 and f.email is not null
  )
  select 0, count(distinct m.email)::int, count(distinct r.email)::int from members m left join ret r on r.email = m.email
  union all
  select m.m, count(*)::int, count(r.email)::int from members m left join ret r on r.email = m.email group by m.m
  order by 1
$$;

-- Put the people who have NOT filed again into a renewal campaign (skipping anyone already in a sequence or unsubscribed).
create or replace function enroll_cohort(p_campaign_id uuid, p_tax_year int, p_month int default null)
returns int language plpgsql as $$
declare v int;
begin
  insert into leads (email, phone, carrier_type, source_file)
  select c.email, c.phone, 'Returning customer', 'renewal TY' || p_tax_year
  from retention_cohort(p_tax_year, p_month) c where not c.returned
  on conflict (email) do nothing;
  with picked as (
    select l.id from retention_cohort(p_tax_year, p_month) c join leads l on l.email = c.email
    where not c.returned and not c.in_sequence and l.status not in ('unsubscribed', 'bounced', 'complained')
  ), ins as (
    insert into enrollments (campaign_id, lead_id, next_send_at)
    select p_campaign_id, id, now() from picked
    on conflict (campaign_id, lead_id) do nothing
    returning lead_id
  )
  select count(*) into v from ins;
  return v;
end $$;
-- Run once in the Supabase SQL editor (safe to re-run). Applies vehicle counts sent by the daily sync.
-- Production's TotalVehicleCount is not kept up to date, so the sync counts the vehicle rows on each return instead.

create or replace function apply_vehicle_counts(p_counts jsonb)
returns int language plpgsql as $$
declare a int; b int;
begin
  -- Set the counts the sync sent...
  update ttp_filings f set vehicle_count = c.n
  from (select (e->>'filing_id')::int as filing_id, (e->>'n')::int as n from jsonb_array_elements(p_counts) e) c
  where f.filing_id = c.filing_id and f.vehicle_count is distinct from c.n;
  get diagnostics a = row_count;
  -- ...and zero any filing that has no counted vehicles.
  update ttp_filings set vehicle_count = 0
  where vehicle_count is distinct from 0
    and filing_id not in (select (e->>'filing_id')::int from jsonb_array_elements(p_counts) e);
  get diagnostics b = row_count;
  return a + b;
end $$;
