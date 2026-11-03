import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { sendBatchStrict, type OutboundEmail } from "@/lib/resend";
import { PEAK_MONTHS, centralMonth } from "@/lib/schedule";
import { fill, renderHtml, renderText, unsubscribeToken } from "@/lib/template";
import { postalAddress, audienceOf } from "@/lib/brand";
import { recordRun, type Problem } from "@/lib/senderMonitor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";   // never reuse an old database answer in a scheduled job

/** Up to this many emails per campaign in one run. With a run every 5 minutes, a day's amount goes out in about the first hour. */
const PER_RUN = 50;

/**
 * Bounce brake. Before sending, look at the campaign's most recent emails (up to 500, sent at least 10 minutes ago so
 * bounce reports have arrived). With 100 or more to judge from, pause the campaign if more than 5% bounced (more than 20% of the first 20 also stops it) or 2 or more
 * were marked as spam. Above those levels Gmail and Yahoo start sending everything from the domain to spam.
 */
const BRAKE_MIN = 100, BRAKE_BOUNCE = 0.05, BRAKE_COMPLAINTS = 2;
async function bounceBrake(sb: ReturnType<typeof supabaseAdmin>, c: any): Promise<string | null> {
  const upTo = new Date(Date.now() - 10 * 60000).toISOString();
  let q = sb.from("messages").select("bounced_at, complained_at").eq("campaign_id", c.id).lte("sent_at", upTo);
  if (c.brake_from) q = q.gte("sent_at", c.brake_from);
  const { data } = await q.order("sent_at", { ascending: false }).limit(500);
  const rows = data ?? [];
  const bounced = rows.filter((m) => m.bounced_at).length, complained = rows.filter((m) => m.complained_at).length;
  if (complained >= BRAKE_COMPLAINTS) return `${complained} of its last ${rows.length} emails were marked as spam`;
  // A very bad list is stopped early: 20 emails are enough to judge when more than a fifth of them bounce.
  if ((rows.length >= BRAKE_MIN && bounced / rows.length > BRAKE_BOUNCE) || (rows.length >= 20 && bounced / rows.length > 0.2)) return `${bounced} of its last ${rows.length} emails bounced (${Math.round((bounced / rows.length) * 1000) / 10}%, the limit is 5%)`;
  return null;
}

/**
 * Every 5 minutes: send due steps for running campaigns, within caps and the send window.
 * Every run records what it did, in plain words, and raises an alert email when a campaign should be sending but is not.
 */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  let out: { body: Record<string, unknown>; result: string; sent: number; problem?: Problem | null };
  try { out = await run(); }
  catch (e: any) {
    const msg = String(e?.message ?? e);
    out = { body: { error: msg }, result: `Sender error: ${msg}`, sent: 0, problem: { key: "sender-error", subject: "TruckTaxPro: the campaign sender hit an error", text: `The campaign sender stopped with this error:\n\n${msg}\n\nIt tries again every 5 minutes. If this email repeats, send the error to support.` } };
  }
  await recordRun(out.result, out.sent, out.problem).catch(() => {});
  return NextResponse.json(out.body);
}

/** Campaigns that have emails due right now (running, or scheduled for a time that has passed). */
async function dueNow(sb: ReturnType<typeof supabaseAdmin>) {
  const nowIso = new Date().toISOString();
  const { data: camps } = await sb.from("campaigns").select("id, name, status, scheduled_at").or(`status.eq.running,and(status.eq.scheduled,scheduled_at.lte.${nowIso})`);
  const out: string[] = [];
  for (const c of camps ?? []) {
    const { count } = await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "active").lte("next_send_at", nowIso);
    if ((count ?? 0) > 0) out.push(c.name);
  }
  return out;
}

async function run(): Promise<{ body: Record<string, unknown>; result: string; sent: number; problem?: Problem | null }> {
  const sb = supabaseAdmin();
  const skip = (reason: string, problem?: Problem | null) => ({ body: { skipped: reason }, result: reason, sent: 0, problem });
  const app = process.env.NEXT_PUBLIC_APP_URL!;
  if (!postalAddress()) return skip("Not sending: the postal address is missing (COMPANY_POSTAL_ADDRESS).", { key: "postal", subject: "TruckTaxPro: campaign emails are not sending", text: "No postal address is set, and every marketing email must carry one. Set COMPANY_POSTAL_ADDRESS in Vercel and redeploy." });

  // Hold all sending (Settings): nothing is sent and scheduled campaigns wait. A missing setting counts as ON, to fail safe.
  const { data: hold, error: holdErr } = await sb.from("settings").select("hold_all").eq("id", 1).maybeSingle();
  // Central time covers TX/IL/IN; CA/GA/OH land within two hours either side.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric", hour12: false }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  const hour = Number(parts.hour) % 24;
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const sendingHours = !weekend && hour >= 9 && hour < 17;
  if (holdErr || !hold || hold.hold_all !== false) {
    const waiting = sendingHours ? await dueNow(sb) : [];
    return skip(holdErr ? "Not sending: the hold setting could not be read (run supabase/patch-013.sql)." : "Not sending: Hold all sending is on.",
      waiting.length ? { key: "hold", subject: "TruckTaxPro: campaigns are waiting because sending is on hold", text: `These campaigns have emails ready to go, but Hold all sending is on, so nothing is sent:\n\n- ${waiting.join("\n- ")}\n\nIf that is intended, ignore this email. Otherwise: Settings, then Release the hold.` } : null);
  }

  // Campaigns scheduled for a time that has now arrived start sending (the window and caps below still apply).
  await sb.from("campaigns").update({ status: "running", scheduled_at: null }).eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());

  if (weekend) return skip("Weekend: nothing is sent until Monday, 9 AM Central.");
  if (!sendingHours) return skip("Outside sending hours (weekdays, 9 AM to 5 PM Central). Waiting for the next window.");

  const [{ data: settings }, { data: today }, { data: month }] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("sends_today").select("n").single(),
    sb.from("sends_this_month").select("n").single(),
  ]);
  // 700 a day normally; 1,000 in the peak months (May, June, July). Both are set in Settings.
  const peak = PEAK_MONTHS.includes(centralMonth(new Date()));
  const dailyCap = peak ? (settings?.peak_daily_cap ?? 1000) : (settings?.global_daily_cap ?? 700);
  const remainingToday = dailyCap - (today?.n ?? 0);
  const remainingMonth = (settings?.monthly_cap ?? 50000) - (month?.n ?? 0);
  let budget = Math.max(0, Math.min(remainingToday, remainingMonth));
  if (budget === 0) return skip(remainingMonth <= 0 ? `Monthly limit of ${settings?.monthly_cap} reached (Settings). Sending resumes on the 1st.` : `Today's overall limit of ${dailyCap} reached (Settings). Sending continues tomorrow.`);

  const { data: campaigns } = await sb.from("campaigns").select("*").eq("status", "running");
  const report: Record<string, number> = {};
  const notes: string[] = [];
  let runFailed = false, failure = "";
  let brakeProblem: Problem | null = null;
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);

  for (const c of campaigns ?? []) {
    if (hour < c.send_window_start || hour >= c.send_window_end) continue;
    const why = await bounceBrake(sb, c);
    if (why) {
      await sb.from("campaigns").update({ status: "paused" }).eq("id", c.id);
      await sb.from("campaigns").update({ paused_reason: `Paused automatically on ${new Date().toISOString().slice(0, 10)}: ${why}.` }).eq("id", c.id);   // needs patch-018.sql; harmless without it
      notes.push(`${c.name}: paused automatically, ${why}`);
      brakeProblem = { key: "brake:" + c.id, subject: `TruckTaxPro: campaign "${c.name}" was paused automatically`,
        text: `The sender paused the campaign "${c.name}" because ${why}.\n\nSending more would risk Gmail and Yahoo putting all TruckTaxPro emails, including customer reminders, into spam. The other campaigns carry on.\n\nWhat to do:\n1. Open the campaign and look at the Recent emails list for bounced addresses.\n2. If the list is a new import (for example FMCSA), run it through an email-verification service, import only the valid addresses as a new list, and start a new campaign for them.\n3. Or press Resume to try again: the count starts from zero, and the sender pauses it again if the next 100 emails bounce as much.` };
      continue;
    }
    const { count: sentToday } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id).gte("sent_at", startOfDay.toISOString());
    const campRemaining = c.daily_cap - (sentToday ?? 0);
    // Send the day's amount early in the window: up to PER_RUN per 5-minute run, until the campaign's Emails per day is used.
    const take = Math.max(0, Math.min(budget, campRemaining, PER_RUN));
    if (take === 0) { if (campRemaining <= 0) notes.push(`${c.name}: today's ${c.daily_cap} sent`); continue; }

    const { data: steps } = await sb.from("campaign_steps").select("*").eq("campaign_id", c.id).order("position");
    if (!steps?.length) continue;
    const lastPos = steps[steps.length - 1].position;

    const { data: due } = await sb.from("enrollments")
      .select("id, current_position, lead:leads(id,email,company_name,state,power_units,fleet_type,phone,is_customer,status)")
      .eq("campaign_id", c.id).eq("status", "active").lte("next_send_at", new Date().toISOString())
      .order("next_send_at").limit(take);

    let sentHere = 0;
    for (let i = 0; i < (due?.length ?? 0); i += 100) {
      const chunk = due!.slice(i, i + 100);
      const outbound: { enrollmentId: string; leadId: string; pos: number; email: OutboundEmail }[] = [];
      for (const e of chunk) {
        const lead: any = e.lead;
        const nextPos = e.current_position + 1;
        // Exit if bounced/unsubscribed/complained, or (prospect campaigns) the lead became a customer.
        if (!lead || ["bounced", "unsubscribed", "complained", "replied"].includes(lead.status)) {
          await sb.from("enrollments").update({ status: "exited_unsub" }).eq("id", e.id); continue;
        }
        if (c.kind === "reminder") {
          // Registered, no return: leaves once they start any return. Started, not paid: leaves once they pay, or the draft is gone.
          const email = String(lead.email).toLowerCase();
          const count = async (q: any) => ((await q).count ?? 0) as number;
          const filings = () => sb.from("ttp_filings").select("filing_id", { count: "exact", head: true }).eq("email", email);
          const done = c.auto_source === "reminder:unpaid"
            ? (await count(filings().eq("tax_year", c.target_tax_year).not("paid_at", "is", null))) > 0
              || (await count(filings().eq("tax_year", c.target_tax_year).eq("status_id", 1))) === 0
            : (await count(filings())) > 0;
          if (done) { await sb.from("enrollments").update({ status: "exited_customer" }).eq("id", e.id); continue; }
        } else if (c.kind !== "renewal" && lead.is_customer) {
          await sb.from("enrollments").update({ status: "exited_customer" }).eq("id", e.id); continue;
        }
        if (c.kind === "renewal" && c.target_tax_year) {
          // Paid (any paid status), matching the dashboard's definition, not only Completed.
          const { count: filedNow } = await sb.from("ttp_filings").select("filing_id", { count: "exact", head: true }).not("paid_at", "is", null).eq("tax_year", c.target_tax_year).eq("email", String(lead.email).toLowerCase());
          if ((filedNow ?? 0) > 0) { await sb.from("enrollments").update({ status: "exited_customer" }).eq("id", e.id); continue; }
        }
        const step = steps.find((s) => s.position === nextPos);
        if (!step) { await sb.from("enrollments").update({ status: "completed" }).eq("id", e.id); continue; }
        const unsub = `${app}/api/u/${unsubscribeToken(lead.email)}`;
        const vars = { ...lead, company: lead.company_name };   // {{company}} reads "company"; the leads table calls it company_name
        const bodyMd = fill(step.body_md, vars);
        outbound.push({
          enrollmentId: e.id, leadId: lead.id, pos: nextPos,
          email: {
            to: lead.email, subject: fill(step.subject, vars),
            html: renderHtml(bodyMd, unsub, audienceOf(c.kind)), text: renderText(bodyMd, unsub, audienceOf(c.kind)), unsubscribeUrl: unsub,
            tags: [{ name: "campaign", value: c.id }, { name: "step", value: String(nextPos) }],
          },
        });
      }
      if (!outbound.length) continue;
      const { ids, error: sendError } = await sendBatchStrict(outbound.map((o) => o.email));
      // Record only what Resend accepted, so a failed batch never uses up the daily limit or shows as sent.
      // Anything not accepted stays due and is tried again on the next run.
      const accepted = outbound.map((o, k) => ({ o, id: ids[k] })).filter((x) => x.id);
      if (accepted.length) await sb.from("messages").insert(accepted.map(({ o, id }) => ({
        enrollment_id: o.enrollmentId, campaign_id: c.id, lead_id: o.leadId, step_position: o.pos,
        resend_id: id, subject: o.email.subject, last_event: "sent",
      })));
      if (sendError) {
        await sb.from("email_events").insert({ type: "dispatch.batch_failed", payload: { campaign: c.id, not_sent: outbound.length - accepted.length, error: sendError } });
        runFailed = true; failure = sendError;
      }
      for (const [k, o] of outbound.entries()) {
        if (!ids[k]) continue;
        const next = steps.find((s) => s.position === o.pos + 1);
        const isLast = o.pos >= lastPos || !next;
        await sb.from("enrollments").update({
          current_position: o.pos,
          status: isLast ? "completed" : "active",
          next_send_at: isLast ? null : new Date(Date.now() + next!.delay_days * 86400000).toISOString(),
        }).eq("id", o.enrollmentId);
        sentHere++;
      }
      if (runFailed) break;
      await new Promise((r) => setTimeout(r, 600)); // stay well under Resend's requests-per-second limit
    }
    budget -= sentHere; report[c.name] = sentHere;

    const { count: stillActive } = await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "active");
    // Reminder campaigns stay open: the daily job keeps adding new people to them.
    if ((stillActive ?? 0) === 0 && c.kind !== "reminder") await sb.from("campaigns").update({ status: "completed" }).eq("id", c.id);
    if (runFailed || budget <= 0) break;
  }
  const total = Object.values(report).reduce((a, b) => a + b, 0);
  const sentText = Object.entries(report).filter(([, n]) => n > 0).map(([k, n]) => `${k}: ${n}`).join("; ");
  if (runFailed) return { body: { sent: report, warning: "Resend rejected a batch. Those emails will be retried on the next run." }, sent: total,
    result: `Resend refused some emails: ${failure}${sentText ? ` (sent: ${sentText})` : ""}`,
    problem: { key: "resend:" + failure.slice(0, 60), subject: "TruckTaxPro: Resend refused campaign emails", text: `Resend did not accept some campaign emails. Its answer:\n\n${failure}\n\nThey are retried every 5 minutes. Common causes: EMAIL_FROM is not on the domain verified in Resend, the Resend plan's limit is used up, or the API key changed.` } };
  if (brakeProblem) return { body: { sent: report, paused: notes }, sent: total, result: `${total ? `Sent ${total} (${sentText}). ` : ""}${notes.filter((x) => x.includes("paused automatically")).join("; ")}`, problem: brakeProblem };
  const result = total ? `Sent ${total} (${sentText})` : (campaigns?.length ? (notes.length ? `Nothing due: ${notes.join("; ")}` : "Nothing due right now.") : "No campaign is running.");
  return { body: { sent: report }, result, sent: total };
}
