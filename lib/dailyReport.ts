import { supabaseAdmin } from "./supabase-server";
import { sendAdminEmail, syncHealth } from "./syncAlert";
import { senderStaleProblem } from "./senderMonitor";
import { when } from "./format";

const app = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://trucktaxpro-filing.com").replace(/\/$/, "");
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "0%");

/**
 * One short email each morning (9 AM India time): is the data fresh, is sending working, and what each campaign did in the
 * last 24 hours. Problems are listed first, so if the first line says "All good" there is nothing to do.
 */
export async function buildDailyReport(now = new Date()) {
  const sb = supabaseAdmin();
  const since = new Date(now.getTime() - 24 * 3600000).toISOString();
  const [health, stale, { data: s }, { data: camps }, { data: msgs }, users, paid] = await Promise.all([
    syncHealth(now), senderStaleProblem(now),
    sb.from("settings").select("hold_all, dispatch_last_at, dispatch_last_result, dispatch_alert_key").eq("id", 1).maybeSingle(),
    sb.from("campaigns").select("*").in("status", ["running", "scheduled", "paused"]).order("created_at"),
    sb.from("messages").select("campaign_id, delivered_at, bounced_at, complained_at, opened_at, clicked_at").gte("sent_at", since).limit(20000),
    sb.from("ttp_users").select("user_id", { count: "exact", head: true }).gte("registered_at", since),
    sb.from("ttp_filings").select("filing_id", { count: "exact", head: true }).gte("paid_at", since),
  ]);

  const problems: string[] = [];
  if (!health.ok) problems.push(`Data sync: ${health.problem} Last good sync: ${when(health.lastOk)}.`);
  if (stale) problems.push("Campaign sender: it has not run in the last 30 minutes. Check Vercel, Cron Jobs.");
  if (s?.dispatch_alert_key && s.dispatch_alert_key !== "hold") problems.push(`Campaign sender: ${s.dispatch_last_result ?? "a problem was reported"}.`);

  for (const c of camps ?? []) if (c.status === "paused" && c.paused_reason) problems.push(`${c.name}: ${c.paused_reason} Check the list before pressing Resume.`);

  const all = msgs ?? [];
  const sum = (rows: typeof all) => ({ sent: rows.length, delivered: rows.filter((m) => m.delivered_at).length, bounced: rows.filter((m) => m.bounced_at).length, complained: rows.filter((m) => m.complained_at).length, opened: rows.filter((m) => m.opened_at).length });
  const total = sum(all);
  if (total.sent >= 20 && total.bounced / total.sent > 0.05) problems.push(`Bounces are high: ${total.bounced} of ${total.sent} (${pct(total.bounced, total.sent)}). Above 5% can hurt the sending domain. Consider Hold all sending and cleaning the list.`);
  if (total.complained > 0) problems.push(`${total.complained} spam complaint(s) in the last 24 hours. Keep complaints under 0.1%.`);

  const lines: string[] = [];
  lines.push(problems.length ? `Needs attention (${problems.length}):` : "All good. Nothing needs your attention.");
  problems.forEach((p) => lines.push(`- ${p}`));
  lines.push("", "Data sync", `- ${health.ok ? "Healthy" : "Problem"}. Last good sync: ${when(health.lastOk)}.`);
  lines.push("", "Sending", `- ${s?.hold_all === false ? "Allowed" : "On hold (Settings)"}. Sender last ran: ${when(s?.dispatch_last_at)}: ${s?.dispatch_last_result ?? "no record yet"}.`);
  lines.push(`- Last 24 hours: ${total.sent} sent, ${total.delivered} delivered, ${total.bounced} bounced (${pct(total.bounced, total.sent)}), ${total.opened} opened.`);

  lines.push("", "Campaigns");
  const active = camps ?? [];
  if (!active.length) lines.push("- None running, scheduled or paused.");
  for (const c of active) {
    const m = sum(all.filter((x) => x.campaign_id === c.id));
    const { count: left } = await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "active");
    const state = c.status === "scheduled" ? `scheduled for ${when(c.scheduled_at)}` : c.status;
    lines.push(`- ${c.name} (${state}, ${c.daily_cap}/day): ${m.sent} sent in 24h, ${m.delivered} delivered, ${m.bounced} bounced; ${left ?? 0} still to email.`);
  }
  lines.push("", "Customers (last 24 hours)", `- ${users.count ?? 0} new registrations, ${paid.count ?? 0} paid returns.`);
  lines.push("", `Dashboard: ${app()}`);

  const subject = problems.length ? `TruckTaxPro daily report: ${problems.length} thing${problems.length > 1 ? "s" : ""} to check` : "TruckTaxPro daily report: all good";
  return { subject, text: lines.join("\n"), problems: problems.length };
}

/** The daily cron: sends the report once per day. force=true (the Settings button) sends it again now. */
export async function runDailyReport(opts: { force?: boolean; now?: Date } = {}) {
  const now = opts.now ?? new Date(); const sb = supabaseAdmin();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);    // yyyy-mm-dd in India
  const { data: s } = await sb.from("settings").select("daily_report_sent_on").eq("id", 1).maybeSingle();
  if (!opts.force && s?.daily_report_sent_on === today) return { ok: true, message: "Already sent today." };
  const report = await buildDailyReport(now);
  const to = await sendAdminEmail({ subject: report.subject, text: report.text }, "daily_report");
  await sb.from("settings").update({ daily_report_sent_on: today }).eq("id", 1);
  return { ok: true, message: `Daily report sent to ${to.join(", ")}.` };
}
