import { supabaseAdmin } from "./supabase-server";
import { resend } from "./resend";
import { when } from "./format";

/** No successful sync for this long means something is wrong (the sync runs once a day). */
const STALE_HOURS = 26;
/** A run that started this long ago and never finished has crashed or hung. */
const STUCK_HOURS = 1;

/** Who receives sync alerts: SYNC_ALERT_EMAILS, or the admin sign-in addresses when that is not set. */
export function alertRecipients() {
  const list = (process.env.SYNC_ALERT_EMAILS || process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim()).filter((s) => s.includes("@"));
  return [...new Set(list)];
}

export type SyncHealth = { ok: boolean; problem: string | null; short?: string; detail: string | null; lastOk: string | null; lastRun: string | null };

/** Looks at the sync's own log in Supabase. Needs nothing from the server, so it also notices a sync that never ran. */
export async function syncHealth(now = new Date()): Promise<SyncHealth> {
  const sb = supabaseAdmin();
  const [{ data: latest }, { data: good }] = await Promise.all([
    sb.from("sync_runs").select("started_at, finished_at, error").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    sb.from("sync_runs").select("started_at").is("error", null).not("finished_at", "is", null).order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const lastOk = good?.started_at ?? null, lastRun = latest?.started_at ?? null;
  const hoursSince = (iso: string | null) => (iso ? (now.getTime() - new Date(iso).getTime()) / 3600000 : Infinity);
  const base = { lastOk, lastRun };

  if (!latest) return { ok: false, problem: "The sync has never reported in.", short: "the daily sync has not run", detail: null, ...base };
  if (latest.error) {
    const partial = /^(Vehicles|Company|Payments) step:/.test(latest.error);
    return { ok: false, problem: partial ? "The last sync finished, but one of its steps failed." : "The last sync failed.", short: partial ? "a step of the daily sync failed" : "the daily sync failed", detail: latest.error, ...base };
  }
  if (!latest.finished_at && hoursSince(latest.started_at) > STUCK_HOURS) return { ok: false, problem: "The last sync started but never finished. It may have crashed or been stopped.", short: "the daily sync did not finish", detail: null, ...base };
  if (hoursSince(lastOk) > STALE_HOURS) return { ok: false, problem: `The sync has not run successfully for more than ${STALE_HOURS} hours. It may not be running at all.`, short: "the daily sync has not run", detail: null, ...base };
  return { ok: true, problem: null, detail: null, ...base };
}

const app = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://trucktaxpro-filing.com").replace(/\/$/, "");
const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function failureEmail(h: SyncHealth, test: boolean) {
  const lines = [
    test ? "This is a TEST of the sync alert. Nothing is wrong; this is what a real alert looks like." : h.problem!,
    "",
    `Last successful sync: ${when(h.lastOk)}`,
    `Last attempt: ${when(h.lastRun)}`,
    ...(h.detail ? ["", "What it reported:", h.detail.slice(0, 600)] : []),
    "",
    "Until it is fixed, the dashboard and campaigns work from old data: new registrations and filings are missing, and leads who became customers are not marked.",
    "",
    "What to check on the InterServer server (Command Prompt as Administrator):",
    "1. cd C:\\trucktaxpro-sync",
    '2. "C:\\Program Files\\nodejs\\node.exe" sync.mjs --check   (should say Connected OK)',
    "3. If it says Failed to connect: make sure .env contains MSSQL_MODE=local. Do not turn on TCP/IP.",
    '4. Then run the sync by hand: "C:\\Program Files\\nodejs\\node.exe" sync.mjs   (should end with done)',
    "5. If nothing ran at all: Task Scheduler, TruckTaxPro Sync, History tab.",
    "",
    `Full guide: ${app()}/kb/sync-server`,
  ];
  const subject = test ? "TEST: TruckTaxPro sync alert" : `TruckTaxPro: ${h.short ?? "daily sync problem"}`;
  return { subject, text: lines.join("\n") };
}

function recoveredEmail(h: SyncHealth) {
  const text = [`The daily sync is working again. Last successful sync: ${when(h.lastOk)}.`, "", "No action is needed. The dashboard is up to date.", "", `Dashboard: ${app()}`].join("\n");
  return { subject: "TruckTaxPro: the daily sync is working again", text };
}

async function send(to: string[], mail: { subject: string; text: string }) {
  if (!process.env.EMAIL_FROM) throw new Error("EMAIL_FROM is not set in Vercel.");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;white-space:pre-wrap">${escape(mail.text)}</div>`;
  const { error } = await resend.emails.send({ from: process.env.EMAIL_FROM, to, subject: mail.subject, text: mail.text, html, tags: [{ name: "kind", value: "sync_alert" }] });
  if (error) throw new Error(error.message);
}

/**
 * The daily check (Vercel cron). Sends at most one failure email a day while the sync is broken,
 * and one "working again" email when it recovers. With test=true it sends a sample alert and changes nothing.
 */
export async function runSyncAlert(opts: { test?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const to = alertRecipients();
  if (!to.length) return { ok: false, message: "No recipients: set SYNC_ALERT_EMAILS or ADMIN_EMAILS in Vercel." };
  const h = await syncHealth(now);
  if (opts.test) { await send(to, failureEmail(h, true)); return { ok: true, message: `Test alert sent to ${to.join(", ")}.`, health: h }; }

  const sb = supabaseAdmin();
  const { data: s } = await sb.from("settings").select("sync_alert_sent_at").eq("id", 1).maybeSingle();
  const sentAt = s?.sync_alert_sent_at ? new Date(s.sync_alert_sent_at) : null;
  const mark = (v: string | null) => sb.from("settings").update({ sync_alert_sent_at: v }).eq("id", 1);

  if (!h.ok) {
    if (sentAt && now.getTime() - sentAt.getTime() < 20 * 3600000) return { ok: true, message: "Still failing; an alert already went out today.", health: h };
    await send(to, failureEmail(h, false)); await mark(now.toISOString());
    return { ok: true, message: `Alert sent to ${to.join(", ")}: ${h.problem}`, health: h };
  }
  if (sentAt) { await send(to, recoveredEmail(h)); await mark(null); return { ok: true, message: "Recovered; working-again email sent.", health: h }; }
  return { ok: true, message: "Sync is healthy. Nothing sent.", health: h };
}
