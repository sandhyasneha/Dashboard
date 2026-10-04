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
