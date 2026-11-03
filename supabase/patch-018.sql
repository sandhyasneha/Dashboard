-- Run once in the Supabase SQL editor (safe to re-run).
-- 1. Bounce brake: the sender pauses a campaign by itself when too many of its emails bounce or are marked as spam,
--    and emails you why. Pressing Resume starts the count again from zero.

alter table campaigns add column if not exists paused_reason text;   -- why the sender paused it (shown on the campaign page)
alter table campaigns add column if not exists brake_from timestamptz; -- bounces are counted from this time (set on Resume)

-- 2. Imports keep the company name, state, truck count and DOT number (the FMCSA files have them), so emails can say
-- {{company}} and campaigns can pick by state. For addresses already on file, only empty details are filled in.
create or replace function fill_lead_details(p_rows jsonb)
returns int language plpgsql as $$
declare v int;
begin
  update leads l set
    phone        = coalesce(l.phone, nullif(r.phone, '')),
    company_name = coalesce(l.company_name, nullif(r.company_name, '')),
    state        = coalesce(l.state, nullif(r.state, '')),
    power_units  = coalesce(l.power_units, r.power_units),
    usdot        = coalesce(l.usdot, nullif(r.usdot, '')),
    updated_at   = now()
  from jsonb_to_recordset(p_rows) as r(email text, phone text, company_name text, state text, power_units int, usdot text)
  where l.email = lower(r.email)
    and ((l.phone is null and nullif(r.phone, '') is not null) or (l.company_name is null and nullif(r.company_name, '') is not null)
      or (l.state is null and nullif(r.state, '') is not null) or (l.power_units is null and r.power_units is not null)
      or (l.usdot is null and nullif(r.usdot, '') is not null));
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function fill_lead_details(jsonb) from public, anon, authenticated;
grant execute on function fill_lead_details(jsonb) to service_role;

-- Check
select name, status, paused_reason, brake_from from campaigns order by created_at desc limit 5;
