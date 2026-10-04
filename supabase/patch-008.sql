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
