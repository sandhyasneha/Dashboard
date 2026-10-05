-- Run once in the Supabase SQL editor (safe to re-run).
-- Ending a campaign, or discarding a draft, now releases its contacts so another campaign can use them.
-- Before this, contacts stayed marked "in sequence" and a replacement campaign skipped them.

alter table enrollments drop constraint if exists enrollments_status_check;
alter table enrollments add constraint enrollments_status_check
  check (status in ('active', 'completed', 'exited_customer', 'exited_bounce', 'exited_unsub', 'exited_reply', 'paused', 'stopped'));

create or replace function release_campaign(p_campaign_id uuid)
returns int language plpgsql as $$
declare v int; ids uuid[];
begin
  -- the contacts still in this campaign
  select coalesce(array_agg(lead_id), '{}') into ids from enrollments where campaign_id = p_campaign_id and status in ('active', 'paused');
  update enrollments set status = 'stopped' where campaign_id = p_campaign_id and status in ('active', 'paused');
  -- back to "new" unless they are still in another live campaign. Replied, unsubscribed, bounced and customer contacts are left alone.
  update leads l set status = 'new', updated_at = now()
  where l.id = any(ids) and l.status = 'in_sequence'
    and not exists (select 1 from enrollments e where e.lead_id = l.id and e.status in ('active', 'paused'));
  get diagnostics v = row_count;
  return v;
end $$;

-- One-time clean-up: campaigns that were ended before this fix still hold their contacts.
select coalesce(sum(n), 0) as contacts_released from (
  select release_campaign(c.id) as n from campaigns c
  where c.status = 'completed' and exists (select 1 from enrollments e where e.campaign_id = c.id and e.status in ('active', 'paused'))
) x;
