-- Run once in the Supabase SQL editor (safe to re-run).
-- Your own email templates: saved sequences that appear in New campaign, under Start from a template.
-- New table, so it gets its own grants (Supabase no longer grants new tables automatically): the app's server only.

create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  steps jsonb not null,                 -- [{ subject, body_md, delay_days }]
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists email_templates_name_idx on email_templates (lower(name));
alter table email_templates enable row level security;

revoke all on table email_templates from public, anon, authenticated;
grant select, insert, update, delete on table email_templates to service_role;

-- Check
select count(*) as your_templates from email_templates;
