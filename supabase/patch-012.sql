-- Run once in the Supabase SQL editor (safe to re-run).
-- Sync alerts: remembers when the last "sync failed" email went out, so you get one a day while it is broken
-- and one "working again" email when it recovers. Adds a column to the existing settings table; no new tables.
alter table settings add column if not exists sync_alert_sent_at timestamptz;

-- Check: the last five sync runs.
select started_at, finished_at, error from sync_runs order by started_at desc limit 5;
