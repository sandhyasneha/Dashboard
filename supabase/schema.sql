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
