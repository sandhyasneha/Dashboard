import { supabaseAdmin } from "./supabase-server";
import { centralDay, centralMonth, centralYear } from "./schedule";
import { FIRST_TAX_YEAR } from "./dash";

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export type AutoStep = { subject: string; body_md: string; delay_days: number };

/** The emails used when nothing has been saved. {{last_filed}}, {{tax_year}} and {{month}} are filled in for each run. */
export const DEFAULT_STEPS: AutoStep[] = [
  { subject: "Time to renew your Form 2290 for {{tax_year}}", delay_days: 0,
    body_md: "Hi there,\n\nYou filed your Form 2290 with TruckTaxPro in {{last_filed}}. The {{tax_year}} tax period is open, and your details are already saved, so filing again is quick.\n\n[File Form 2290 for {{tax_year}}](https://trucktaxpro.com)\n\nIf you have already filed, thank you, and you can ignore this email. Reply here if you have a question." },
  { subject: "Reminder: your Form 2290 for {{tax_year}}", delay_days: 7,
    body_md: "Hi there,\n\nA quick reminder that your Form 2290 for the {{tax_year}} tax period has not been filed with us yet.\n\n[File Form 2290](https://trucktaxpro.com)\n\nIf you filed somewhere else, you can ignore this email." },
];

export const taxLabelShort = (y: number) => `${y}-${String(y + 1).slice(2)}`;          // 2027-28
const calendarYearOf = (taxYear: number, month: number) => (month >= 7 ? taxYear : taxYear + 1);

/** For a moment in time: the group of customers who filed in this same month last year, and the tax year they should now file in. */
export function monthlyPlan(now: Date) {
  const month = centralMonth(now), year = centralYear(now);
  const cohortTaxYear = month >= 7 ? year - 1 : year - 2;
  return { month, year, monthName: MONTH_NAMES[month - 1], cohortTaxYear, followTaxYear: cohortTaxYear + 1, lastFiled: `${MONTH_NAMES[month - 1]} ${year - 1}` };
}

/** The words for a chosen group on the Retention page: month null means the whole tax year. */
export function cohortWords(cohortTaxYear: number, month: number | null) {
  return {
    monthName: month ? MONTH_NAMES[month - 1] : "",
    lastFiled: month ? `${MONTH_NAMES[month - 1]} ${calendarYearOf(cohortTaxYear, month)}` : `the ${taxLabelShort(cohortTaxYear)} season`,
    taxYear: taxLabelShort(cohortTaxYear + 1),
  };
}

export const fillPlaceholders = (text: string, p: { monthName: string; lastFiled: string; taxYear: string }) =>
  text.replace(/\{\{\s*month\s*\}\}/g, p.monthName).replace(/\{\{\s*last_filed\s*\}\}/g, p.lastFiled).replace(/\{\{\s*tax_year\s*\}\}/g, p.taxYear);

export function loadSteps(raw: unknown): AutoStep[] {
  if (!Array.isArray(raw) || !raw.length) return DEFAULT_STEPS;
  const ok = raw.filter((s: any) => typeof s?.subject === "string" && typeof s?.body_md === "string" && s.subject.trim() && s.body_md.trim());
  return ok.length ? ok.map((s: any) => ({ subject: s.subject, body_md: s.body_md, delay_days: Number(s.delay_days) || 0 })) : DEFAULT_STEPS;
}

/** Creates a renewal campaign for everyone in the group who has not filed again, and enrolls them. Returns id null when nobody qualified. */
export async function createRenewalCampaign(o: {
  name: string; cohortTaxYear: number; month: number | null; steps: AutoStep[]; dailyCap: number; autoSource: string | null; status: "draft" | "running";
}) {
  const sb = supabaseAdmin();
  const { data: c, error } = await sb.from("campaigns").insert({ name: o.name, daily_cap: o.dailyCap, kind: "renewal", target_tax_year: o.cohortTaxYear + 1, auto_source: o.autoSource }).select().single();
  if (error || !c) throw new Error(error?.message ?? "Could not create the campaign. Did you run supabase/patch-008.sql?");
  const { error: se } = await sb.from("campaign_steps").insert(o.steps.map((s, i) => ({ campaign_id: c.id, position: i + 1, subject: s.subject, body_md: s.body_md, delay_days: i === 0 ? 0 : s.delay_days })));
  if (se) { await sb.from("campaigns").delete().eq("id", c.id); throw new Error(se.message); }
  const { data: enrolled, error: ee } = await sb.rpc("enroll_cohort", { p_campaign_id: c.id, p_tax_year: o.cohortTaxYear, p_month: o.month });
  if (ee) { await sb.from("campaigns").delete().eq("id", c.id); throw new Error(ee.message + " (Did you run supabase/patch-008.sql?)"); }
  if (!enrolled) { await sb.from("campaigns").delete().eq("id", c.id); return { id: null as string | null, enrolled: 0 }; }
  if (o.status !== "draft") await sb.from("campaigns").update({ status: o.status }).eq("id", c.id);
  return { id: c.id as string, enrolled: Number(enrolled) };
}

/**
 * The monthly job. Once a month it takes the customers who filed in this same month last year, drops anyone who has already
 * filed in the current tax year, and creates a renewal campaign: a draft for you to review, or running if you chose automatic.
 */
export async function runMonthlyRetention(opts: { force?: boolean; now?: Date } = {}) {
  const sb = supabaseAdmin(); const now = opts.now ?? new Date();
  const { data: cfg, error } = await sb.from("retention_auto").select("*").eq("id", 1).maybeSingle();
  if (error || !cfg) return { ok: false as const, message: "Monthly renewals are not set up yet. Run supabase/patch-008.sql in Supabase." };
  const plan = monthlyPlan(now);
  const ym = `${plan.year}-${String(plan.month).padStart(2, "0")}`;
  const record = async (message: string) => { await sb.from("retention_auto").update({ last_result: message, last_run_month: ym, updated_at: new Date().toISOString() }).eq("id", 1); };

  if (!opts.force) {
    if (!cfg.enabled) return { ok: true as const, skipped: "Monthly renewals are switched off." };
    if (centralDay(now) < cfg.send_day) return { ok: true as const, skipped: `Waiting for day ${cfg.send_day} of the month.` };
  }
  if (cfg.last_run_month === ym) return { ok: true as const, skipped: `Already handled for ${plan.monthName} ${plan.year}. Look for it under Ready to review, or in Campaigns.` };

  if (plan.cohortTaxYear < FIRST_TAX_YEAR) {
    const message = `Nobody to remind yet: this platform has no filings from ${plan.lastFiled}.`;
    await record(message); return { ok: true as const, skipped: message };
  }
  const words = { monthName: plan.monthName, lastFiled: plan.lastFiled, taxYear: taxLabelShort(plan.followTaxYear) };
  const steps = loadSteps(cfg.steps).map((s) => ({ ...s, subject: fillPlaceholders(s.subject, words), body_md: fillPlaceholders(s.body_md, words) }));
  const status = cfg.mode === "auto" ? "running" : "draft";
  const r = await createRenewalCampaign({ name: `Renewals · ${plan.monthName} ${plan.year} (filed ${plan.lastFiled})`, cohortTaxYear: plan.cohortTaxYear, month: plan.month, steps, dailyCap: cfg.daily_cap, autoSource: "retention", status });
  if (!r.id) {
    const message = `Nobody to remind for ${plan.monthName} ${plan.year}: everyone who filed in ${plan.lastFiled} has filed again, is already in a sequence, or has unsubscribed.`;
    await record(message); return { ok: true as const, skipped: message };
  }
  const message = status === "running" ? `Started ${r.enrolled} renewal reminders for ${plan.monthName} ${plan.year}.` : `Draft ready to review: ${r.enrolled} customers who filed in ${plan.lastFiled}.`;
  await record(message);
  return { ok: true as const, message, campaignId: r.id, enrolled: r.enrolled, status };
}
