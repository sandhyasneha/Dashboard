-- Run once in the Supabase SQL editor (safe to re-run). Daily limits: 700 normally, 1,000 in May, June and July.
alter table settings add column if not exists peak_daily_cap int not null default 1000;
update settings set global_daily_cap = 700, peak_daily_cap = 1000, monthly_cap = 50000, updated_at = now() where id = 1;
