-- Run once in the Supabase SQL editor (safe to re-run). Needs patch-008 first.
-- Customers list: one row per customer with name, company, phone, registered date, tax year, first-used month(s), status and source.
-- Also: company names from the sync (optional), and a richer "Import past filers".
-- Creates no new tables. The new functions are given to service_role only (the app's server), never to anon.

-- 1. New columns -------------------------------------------------------------------------------------------------------
alter table ttp_filings add column if not exists company text;                 -- business name on the return (optional sync step)

alter table retention_imports add column if not exists name text;
alter table retention_imports add column if not exists company text;
alter table retention_imports add column if not exists phone text;
alter table retention_imports add column if not exists registered_at timestamptz;
alter table retention_imports add column if not exists first_used_month int;    -- 1 to 12

-- 2. First used month from production may be stored as YYYYMM (202610) or as a month number (10). Returns 1 to 12, or null.
create or replace function fum_month(v int) returns int language sql immutable as $$
  select case when v between 1 and 12 then v
              when v >= 190001 and v % 100 between 1 and 12 then v % 100 end
$$;

-- 3. Company names sent by the daily sync. Only changed rows are written. Returns how many changed.
create or replace function apply_company_names(p_rows jsonb)
returns int language plpgsql as $$
declare v int;
begin
  update ttp_filings f set company = c.company
  from (select (e->>'filing_id')::int as filing_id, nullif(trim(e->>'company'), '') as company
        from jsonb_array_elements(p_rows) e) c
  where f.filing_id = c.filing_id and f.company is distinct from c.company;
  get diagnostics v = row_count;
  return v;
end $$;

-- 4. Import past filers. A re-import fills in or corrects details, but a blank cell never wipes what is already saved.
--    p_rows: [{ email, filed_on: "yyyy-mm-dd", name, company, phone, registered_at, first_used_month }]
create or replace function import_past_filers(p_rows jsonb, p_source text default null)
returns int language plpgsql as $$
declare v int;
begin
  insert into retention_imports as t (email, filed_on, source, name, company, phone, registered_at, first_used_month)
  select lower(trim(e->>'email')), (e->>'filed_on')::date, left(p_source, 80),
         nullif(trim(e->>'name'), ''), nullif(trim(e->>'company'), ''), nullif(trim(e->>'phone'), ''),
         nullif(e->>'registered_at', '')::timestamptz,
         case when (e->>'first_used_month') ~ '^\d{1,2}$' and (e->>'first_used_month')::int between 1 and 12 then (e->>'first_used_month')::int end
  from jsonb_array_elements(p_rows) e
  where coalesce(e->>'email', '') <> '' and coalesce(e->>'filed_on', '') <> ''
  on conflict (email, filed_on) do update set
    name = coalesce(excluded.name, t.name),
    company = coalesce(excluded.company, t.company),
    phone = coalesce(excluded.phone, t.phone),
    registered_at = coalesce(excluded.registered_at, t.registered_at),
    first_used_month = coalesce(excluded.first_used_month, t.first_used_month);
  get diagnostics v = row_count;
  return v;
end $$;

-- 5. The customers list. One row per email: everyone who registered on trucktaxpro.com, plus imported past filers.
--    tax_year     = the latest tax year they have a return in (paid or not), or imported.
--    fum_months   = the first-used months (1 to 12) of their returns in that tax year.
--    status       = for that tax year: Filed & paid, Filed (imported), Started, not paid; or Registered only.
--    source       = Existing lead (was on your contact list before signing up), New (was not),
--                   Past customer (signed up before the contact list was loaded), Imported (only in an import file).
create or replace function customers_list()
returns table(email text, name text, company text, phone text, registered_at timestamptz, status text,
              tax_year int, fum_months int[], source text, paid_returns int, last_filed_at timestamptz, suppressed boolean)
language sql stable as $$
  with fil as (
    select lower(f.email) as em, f.tax_year, f.paid_at, fum_month(f.first_used_month) as fm,
           nullif(trim(f.company), '') as company, coalesce(f.modified_at, f.created_at) as touched
    from ttp_filings f where f.email is not null
  ), imp as (
    select lower(i.email) as em, i.tax_year, i.first_used_month as fm, i.filed_on, i.created_at,
           nullif(trim(i.name), '') as name, nullif(trim(i.company), '') as company, nullif(trim(i.phone), '') as phone, i.registered_at
    from retention_imports i
  ), usr as (
    select lower(u.email) as em, min(u.registered_at) as registered_at,
           (array_agg(nullif(trim(u.name), '') order by u.registered_at desc nulls last) filter (where nullif(trim(u.name), '') is not null))[1] as name,
           (array_agg(nullif(trim(u.phone), '') order by u.registered_at desc nulls last) filter (where nullif(trim(u.phone), '') is not null))[1] as phone
    from ttp_users u where u.email is not null group by 1
  ), years as (
    select y.em, max(y.tax_year) as ty
    from (select em, tax_year from fil union all select em, tax_year from imp) y
    where y.tax_year is not null group by y.em
  ), f_sum as (
    select f.em,
           bool_or(f.tax_year = y.ty and f.paid_at is not null) as paid_latest,
           bool_or(f.tax_year = y.ty) as started_latest,
           (count(*) filter (where f.paid_at is not null))::int as paid_returns,
           max(f.paid_at) as last_paid_at,
           array_agg(distinct f.fm) filter (where f.fm is not null and f.tax_year = y.ty) as months,
           (array_agg(f.company order by f.touched desc nulls last) filter (where f.company is not null))[1] as company
    from fil f left join years y on y.em = f.em group by f.em
  ), i_sum as (
    select i.em,
           bool_or(i.tax_year = y.ty) as imported_latest,
           -- an imported filing that the system also has (same customer, tax year and month) is counted once
           (count(*) filter (where not exists (select 1 from fil f where f.em = i.em and f.tax_year = i.tax_year and f.paid_at is not null
                                                and date_trunc('month', f.paid_at) = date_trunc('month', i.filed_on::timestamptz))))::int as imported_returns,
           max(i.filed_on)::timestamptz as last_filed_on,
           array_agg(distinct i.fm) filter (where i.fm is not null and i.tax_year = y.ty) as months,
           (array_agg(i.name order by i.created_at desc) filter (where i.name is not null))[1] as name,
           (array_agg(i.company order by i.created_at desc) filter (where i.company is not null))[1] as company,
           (array_agg(i.phone order by i.created_at desc) filter (where i.phone is not null))[1] as phone,
           min(i.registered_at) as registered_at
    from imp i left join years y on y.em = i.em group by i.em
  ), people as (
    select em from usr union select em from fil union select em from imp
  ), cut as (
    select min(created_at) as at from leads
  )
  select p.em,
         coalesce(u.name, i.name),
         coalesce(f.company, i.company, nullif(trim(l.company_name), '')),
         coalesce(u.phone, i.phone, nullif(trim(l.phone), '')),
         coalesce(u.registered_at, i.registered_at),
         case when coalesce(f.paid_latest, false) then 'Filed & paid'
              when coalesce(i.imported_latest, false) then 'Filed (imported)'
              when coalesce(f.started_latest, false) then 'Started, not paid'
              else 'Registered only' end,
         y.ty,
         (select array_agg(distinct m order by m) from unnest(coalesce(f.months, '{}') || coalesce(i.months, '{}')) m),
         case when u.em is null then 'Imported'
              when cut.at is not null and u.registered_at < cut.at then 'Past customer'
              when l.created_at is not null and l.created_at < u.registered_at then 'Existing lead'
              else 'New' end,
         coalesce(f.paid_returns, 0) + coalesce(i.imported_returns, 0),
         greatest(f.last_paid_at, i.last_filed_on),
         exists (select 1 from suppressions s where s.email = p.em)
  from people p
  cross join cut
  left join usr u on u.em = p.em
  left join f_sum f on f.em = p.em
  left join i_sum i on i.em = p.em
  left join years y on y.em = p.em
  left join leads l on l.email = p.em
$$;

-- 6. Counts for the cards and the filter menus, in one call.
create or replace function customers_summary()
returns table(kind text, label text, n int) language sql stable as $$
  with c as (select * from customers_list())
  select 'total'::text, 'all'::text, count(*)::int from c
  union all select 'status', c.status, count(*)::int from c group by c.status
  union all select 'source', c.source, count(*)::int from c group by c.source
  union all select 'ty', c.tax_year::text, count(*)::int from c where c.tax_year is not null group by c.tax_year
$$;

-- 7. Access: the app's server (service_role) only. These return customer details, so anon and signed-in browser roles get nothing.
revoke all on function customers_list() from public, anon, authenticated;
revoke all on function customers_summary() from public, anon, authenticated;
revoke all on function import_past_filers(jsonb, text) from public, anon, authenticated;
revoke all on function apply_company_names(jsonb) from public, anon, authenticated;
grant execute on function customers_list() to service_role;
grant execute on function customers_summary() to service_role;
grant execute on function import_past_filers(jsonb, text) to service_role;
grant execute on function apply_company_names(jsonb) to service_role;
grant execute on function fum_month(int) to service_role;

-- 8. Check: how many customers, by status.
select label as status, n from customers_summary() where kind in ('total', 'status') order by n desc;
