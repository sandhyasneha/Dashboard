import { supabaseAdmin } from "./supabase-server";
import { activeTaxYear } from "./dash";
import { taxLabelShort } from "./retention";

export type ReminderGroup = "registered" | "unpaid";
export type ReminderStep = { subject: string; body_md: string; delay_days: number };
export type ReminderConfig = { enabled: boolean; daily_cap: number; steps: Record<ReminderGroup, ReminderStep[]> };

export const GROUPS: { key: ReminderGroup; title: string; who: string }[] = [
  { key: "registered", title: "Registered, no return started", who: "Signed up 1 to 60 days ago and has not started a return. Leaves as soon as they start one." },
  { key: "unpaid", title: "Started a return, not paid", who: "Has a draft return in the current tax year, started 1 to 60 days ago, and nothing paid. Leaves as soon as they pay." },
];

/** The emails used until you change them. {{tax_year}} becomes the current tax year, for example 2026-27. */
export const DEFAULT_REMINDERS: ReminderConfig = {
  enabled: false,
  daily_cap: 50,
  steps: {
    registered: [
      { subject: "Your TruckTaxPro account is ready", delay_days: 0,
        body_md: "Hi there,\n\nThanks for creating your TruckTaxPro account. Filing your Form 2290 takes just a few minutes: add your business and vehicles, pay, and your stamped Schedule 1 arrives by email.\n\n[File your Form 2290](https://trucktaxpro.com)\n\nQuestions? Just reply to this email and we will help." },
      { subject: "Need a hand with your Form 2290?", delay_days: 3,
        body_md: "Hi there,\n\nYou signed up with TruckTaxPro but have not started your Form 2290 yet. If anything is unclear, reply to this email and we will walk you through it.\n\n[Start your Form 2290](https://trucktaxpro.com)\n\nIf you have already filed somewhere else, you can ignore this email." },
    ],
    unpaid: [
      { subject: "Your Form 2290 is saved: finish it to get your Schedule 1", delay_days: 0,
        body_md: "Hi there,\n\nYou started your Form 2290 for the {{tax_year}} tax period, but it has not been submitted yet. Your details are saved, so it only takes a minute to finish.\n\n[Finish your Form 2290](https://trucktaxpro.com)\n\nOnce it is submitted, your stamped Schedule 1 arrives by email. Reply here if you have a question." },
      { subject: "Reminder: your Form 2290 is not submitted yet", delay_days: 3,
        body_md: "Hi there,\n\nA quick reminder that your Form 2290 for {{tax_year}} is still waiting to be submitted. Filing late can lead to IRS penalties.\n\n[Finish your Form 2290](https://trucktaxpro.com)\n\nIf you have already filed somewhere else, you can ignore this email." },
    ],
  },
};

function cleanSteps(raw: unknown, fallback: ReminderStep[]): ReminderStep[] {
  if (!Array.isArray(raw) || !raw.length) return fallback;
  const ok = raw.filter((s: any) => typeof s?.subject === "string" && typeof s?.body_md === "string" && s.subject.trim() && s.body_md.trim());
  return ok.length ? ok.slice(0, 5).map((s: any, i: number) => ({ subject: s.subject, body_md: s.body_md, delay_days: i === 0 ? 0 : Math.min(30, Math.max(1, Math.floor(Number(s.delay_days) || 3))) })) : fallback;
}

export function loadReminderConfig(raw: any): ReminderConfig {
  return {
    enabled: !!raw?.enabled,
    daily_cap: Math.min(5000, Math.max(1, Math.floor(Number(raw?.daily_cap) || DEFAULT_REMINDERS.daily_cap))),
    steps: { registered: cleanSteps(raw?.steps?.registered, DEFAULT_REMINDERS.steps.registered), unpaid: cleanSteps(raw?.steps?.unpaid, DEFAULT_REMINDERS.steps.unpaid) },
  };
}

const fillTY = (s: string, ty: number) => s.replace(/\{\{\s*tax_year\s*\}\}/g, taxLabelShort(ty));
const nameOf = (g: ReminderGroup, ty: number) => (g === "registered" ? "Reminder · Registered, no return started" : `Reminder · Started, not paid · ${taxLabelShort(ty)}`);

/** The open (not ended) reminder campaign for a group. Started-not-paid has one per tax year. */
export async function openReminderCampaign(g: ReminderGroup, ty: number) {
  let q = supabaseAdmin().from("campaigns").select("id, name, status, daily_cap").eq("kind", "reminder").eq("auto_source", `reminder:${g}`).neq("status", "completed");
  if (g === "unpaid") q = q.eq("target_tax_year", ty);
  const { data } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  return data as { id: string; name: string; status: string; daily_cap: number } | null;
}

async function writeSteps(campaignId: string, steps: ReminderStep[], ty: number) {
  const sb = supabaseAdmin();
  const { error: de } = await sb.from("campaign_steps").delete().eq("campaign_id", campaignId);
  if (de) throw new Error(de.message);
  const { error } = await sb.from("campaign_steps").insert(steps.map((s, i) => ({ campaign_id: campaignId, position: i + 1, subject: fillTY(s.subject, ty), body_md: fillTY(s.body_md, ty), delay_days: i === 0 ? 0 : s.delay_days })));
  if (error) throw new Error(error.message);
}

/** Puts the saved wording and daily limit onto the open reminder campaigns, so an edit applies to everyone still waiting for an email. */
export async function applyConfigToCampaigns(cfg: ReminderConfig) {
  const ty = await activeTaxYear();
  for (const g of GROUPS) {
    const c = await openReminderCampaign(g.key, ty);
    if (!c) continue;
    await writeSteps(c.id, cfg.steps[g.key], ty);
    await supabaseAdmin().from("campaigns").update({ daily_cap: cfg.daily_cap }).eq("id", c.id);
  }
}

/**
 * The daily job. Makes sure each reminder campaign exists (new ones start as a DRAFT for you to review and start),
 * then adds the people who qualify today. It never starts a campaign: you press Start now once, after review.
 * Nothing is emailed while Hold all sending is on.
 */
export async function runReminders(opts: { force?: boolean } = {}) {
  const sb = supabaseAdmin();
  const { data: s, error } = await sb.from("settings").select("reminders").eq("id", 1).maybeSingle();
  if (error) return { ok: false as const, message: "Reminders are not set up yet. Run supabase/patch-013.sql in Supabase." };
  const cfg = loadReminderConfig(s?.reminders);
  if (!cfg.enabled && !opts.force) return { ok: true as const, message: "Automatic reminders are switched off." };
  const ty = await activeTaxYear();
  const parts: string[] = [];
  for (const g of GROUPS) {
    let c = await openReminderCampaign(g.key, ty);
    if (!c) {
      const { data, error: ce } = await sb.from("campaigns").insert({
        name: nameOf(g.key, ty), daily_cap: cfg.daily_cap, kind: "reminder", auto_source: `reminder:${g.key}`,
        target_tax_year: g.key === "unpaid" ? ty : null, status: "draft",
      }).select("id, name, status, daily_cap").single();
      if (ce || !data) throw new Error((ce?.message ?? "Could not create the reminder campaign") + " (Did you run supabase/patch-013.sql?)");
      c = data;
      await writeSteps(c.id, cfg.steps[g.key], ty);
    }
    const { data: added, error: ee } = await sb.rpc("enroll_reminders", { p_campaign_id: c.id, p_group: g.key, p_tax_year: ty });
    if (ee) throw new Error(ee.message + " (Did you run supabase/patch-013.sql?)");
    parts.push(`${g.title}: ${Number(added ?? 0)} added${c.status === "draft" ? " (draft: review it and press Start now)" : c.status === "paused" ? " (paused)" : ""}`);
  }
  const message = parts.join(" · ");
  await sb.from("settings").update({ reminders_last_result: message, reminders_last_run: new Date().toISOString() }).eq("id", 1);
  return { ok: true as const, message };
}
