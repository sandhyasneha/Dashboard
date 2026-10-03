import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-server";
import { sendBatch, type OutboundEmail } from "@/lib/resend";
import { fill, renderHtml, renderText, unsubscribeToken } from "@/lib/template";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Every 15 min: send due steps for running campaigns, within caps and the send window. */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  const sb = supabaseAdmin();
  const app = process.env.NEXT_PUBLIC_APP_URL!;

  // Campaigns scheduled for a time that has now arrived start sending (the window and caps below still apply).
  await sb.from("campaigns").update({ status: "running", scheduled_at: null }).eq("status", "scheduled").lte("scheduled_at", new Date().toISOString());

  // Central time covers TX/IL/IN; CA/GA/OH land within two hours either side.
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/Chicago" }).format(new Date()));
  const dow = new Date().getUTCDay();
  if (dow === 0 || dow === 6) return NextResponse.json({ skipped: "weekend" });

  const [{ data: settings }, { data: today }, { data: month }] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("sends_today").select("n").single(),
    sb.from("sends_this_month").select("n").single(),
  ]);
  const remainingToday = (settings?.global_daily_cap ?? 800) - (today?.n ?? 0);
  const remainingMonth = (settings?.monthly_cap ?? 20000) - (month?.n ?? 0);
  let budget = Math.max(0, Math.min(remainingToday, remainingMonth));
  if (budget === 0) return NextResponse.json({ skipped: "cap reached" });

  const { data: campaigns } = await sb.from("campaigns").select("*").eq("status", "running");
  const report: Record<string, number> = {};
  const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0);

  for (const c of campaigns ?? []) {
    if (hour < c.send_window_start || hour >= c.send_window_end) continue;
    const { count: sentToday } = await sb.from("messages").select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id).gte("sent_at", startOfDay.toISOString());
    const campRemaining = c.daily_cap - (sentToday ?? 0);
    // Spread the daily cap across the window (4 runs per hour) instead of one burst.
    const perRun = Math.ceil(c.daily_cap / Math.max(1, (c.send_window_end - c.send_window_start) * 4));
    const take = Math.max(0, Math.min(budget, campRemaining, perRun));
    if (take === 0) continue;

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
        if (c.kind !== "renewal" && lead.is_customer) {
          await sb.from("enrollments").update({ status: "exited_customer" }).eq("id", e.id); continue;
        }
        if (c.kind === "renewal" && c.target_tax_year) {
          const { count: filedNow } = await sb.from("ttp_filings").select("filing_id", { count: "exact", head: true }).eq("status_id", 4).eq("tax_year", c.target_tax_year).ilike("email", lead.email);
          if ((filedNow ?? 0) > 0) { await sb.from("enrollments").update({ status: "exited_customer" }).eq("id", e.id); continue; }
        }
        const step = steps.find((s) => s.position === nextPos);
        if (!step) { await sb.from("enrollments").update({ status: "completed" }).eq("id", e.id); continue; }
        const unsub = `${app}/api/u/${unsubscribeToken(lead.email)}`;
        const bodyMd = fill(step.body_md, lead);
        outbound.push({
          enrollmentId: e.id, leadId: lead.id, pos: nextPos,
          email: {
            to: lead.email, subject: fill(step.subject, lead),
            html: renderHtml(bodyMd, unsub), text: renderText(bodyMd, unsub), unsubscribeUrl: unsub,
            tags: [{ name: "campaign", value: c.id }, { name: "step", value: String(nextPos) }],
          },
        });
      }
      if (!outbound.length) continue;
      const ids = await sendBatch(outbound.map((o) => o.email));
      await sb.from("messages").insert(outbound.map((o, k) => ({
        enrollment_id: o.enrollmentId, campaign_id: c.id, lead_id: o.leadId, step_position: o.pos,
        resend_id: ids[k], subject: o.email.subject, last_event: ids[k] ? "sent" : "failed",
      })));
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
    }
    budget -= sentHere; report[c.name] = sentHere;

    const { count: stillActive } = await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("status", "active");
    if ((stillActive ?? 0) === 0) await sb.from("campaigns").update({ status: "completed" }).eq("id", c.id);
    if (budget <= 0) break;
  }
  return NextResponse.json({ sent: report });
}
