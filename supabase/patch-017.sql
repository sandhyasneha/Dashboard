-- Run once in the Supabase SQL editor (safe to re-run).
-- Sender monitoring: every run of the sender records what it did (or why it did not send), an alert email goes out
-- when a campaign should be sending but is not, and a daily report is sent each morning.
-- No new tables: new columns on the existing settings row.

alter table settings add column if not exists dispatch_last_at timestamptz;      -- when the sender last ran
alter table settings add column if not exists dispatch_last_result text;         -- what it did, in plain words
alter table settings add column if not exists dispatch_last_sent_at timestamptz; -- the last run that actually sent something
alter table settings add column if not exists dispatch_alert_key text;           -- which problem the last alert was about
alter table settings add column if not exists dispatch_alert_sent_at timestamptz;
alter table settings add column if not exists daily_report_sent_on date;         -- one report a day

-- Check
select dispatch_last_at, dispatch_last_result from settings where id = 1;
