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
