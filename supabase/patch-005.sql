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
