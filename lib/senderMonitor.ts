import { supabaseAdmin } from "./supabase-server";
import { sendAdminEmail } from "./syncAlert";

/** Same problem again within this many hours: no second email. */
const REPEAT_HOURS = 12;

export type Problem = { key: string; subject: string; text: string };
const app = () => (process.env.NEXT_PUBLIC_APP_URL ?? "https://trucktaxpro-filing.com").replace(/\/$/, "");

/**
 * Called at the end of every sender run. Saves what happened in plain words (shown on the Campaigns page),
 * emails the admins when there is a problem (once per problem per 12 hours), and says so when it is fixed.
 */
export async function recordRun(result: string, sent: number, problem?: Problem | null) {
  const sb = supabaseAdmin(); const now = new Date();
  const { data: s } = await sb.from("settings").select("dispatch_alert_key, dispatch_alert_sent_at").eq("id", 1).maybeSingle();
  const patch: Record<string, unknown> = { dispatch_last_at: now.toISOString(), dispatch_last_result: result.slice(0, 500) };
  if (sent > 0) patch.dispatch_last_sent_at = now.toISOString();
  try {
    if (problem) {
      const recent = s?.dispatch_alert_key === problem.key && s?.dispatch_alert_sent_at && now.getTime() - new Date(s.dispatch_alert_sent_at).getTime() < REPEAT_HOURS * 3600000;
      if (!recent) {
        await sendAdminEmail({ subject: problem.subject, text: `${problem.text}\n\nCampaigns: ${app()}/campaigns\nGuide: ${app()}/kb/troubleshooting` }, "sender_alert");
        patch.dispatch_alert_key = problem.key; patch.dispatch_alert_sent_at = now.toISOString();
      }
    } else if (s?.dispatch_alert_key?.startsWith("brake:")) {
      // An automatic pause was already emailed; the campaign page and the daily report keep showing it. Nothing more to send.
      patch.dispatch_alert_key = null; patch.dispatch_alert_sent_at = null;
    } else if (s?.dispatch_alert_key && sent > 0) {
      await sendAdminEmail({ subject: "TruckTaxPro: campaign emails are sending again", text: `Campaign emails are going out again. This run: ${result}\n\nNo action is needed.\n\n${app()}/campaigns` }, "sender_alert");
      patch.dispatch_alert_key = null; patch.dispatch_alert_sent_at = null;
    }
  } catch (e) {
    patch.dispatch_last_result = `${result} (alert email failed: ${String((e as Error).message ?? e)})`.slice(0, 500);
  }
  await sb.from("settings").update(patch).eq("id", 1);   // silently skipped until patch-017.sql adds the columns
}

/** On a weekday during sending hours, the sender should have run in the last half hour. Used by the daily checks. */
export async function senderStaleProblem(now = new Date()): Promise<Problem | null> {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const h = Number(p.hour) % 24;
  if (p.weekday === "Sat" || p.weekday === "Sun" || h < 9 || h >= 17) return null;
  const { data: s } = await supabaseAdmin().from("settings").select("dispatch_last_at").eq("id", 1).maybeSingle();
  const last = s?.dispatch_last_at ? new Date(s.dispatch_last_at) : null;
  if (last && now.getTime() - last.getTime() < 30 * 60000) return null;
  return {
    key: "sender-not-running",
    subject: "TruckTaxPro: the campaign sender has not run",
    text: `The campaign sender should run every 5 minutes, but its last run was ${last ? last.toISOString().replace("T", " ").slice(0, 16) + " UTC" : "never recorded"}.\n\nCheck Vercel: your project, Settings, Cron Jobs. /api/cron/dispatch must be listed and Cron Jobs must be Enabled. Then open View Logs for it: each call should show status 200.`,
  };
}

/** Sends the stale-sender alert if needed (once per 12 hours), without touching the last-run record. */
export async function alertIfSenderStale(now = new Date()) {
  const problem = await senderStaleProblem(now);
  if (!problem) return "Sender is running.";
  const sb = supabaseAdmin();
  const { data: s } = await sb.from("settings").select("dispatch_alert_key, dispatch_alert_sent_at").eq("id", 1).maybeSingle();
  if (s?.dispatch_alert_key === problem.key && s?.dispatch_alert_sent_at && now.getTime() - new Date(s.dispatch_alert_sent_at).getTime() < REPEAT_HOURS * 3600000) return "Sender not running; alert already sent.";
  await sendAdminEmail({ subject: problem.subject, text: problem.text }, "sender_alert");
  await sb.from("settings").update({ dispatch_alert_key: problem.key, dispatch_alert_sent_at: now.toISOString() }).eq("id", 1);
  return "Sender not running; alert sent.";
}
