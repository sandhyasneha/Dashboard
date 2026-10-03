import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { sendBatchStrict, type OutboundEmail } from "@/lib/resend";
import { fill, renderHtml, renderText, unsubscribeToken } from "@/lib/template";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * POST { to, ... } sends test emails right now, any day and hour. Enrolls nobody, records nothing against the campaign.
 *  to: one address or up to 5 separated by commas.
 *  what to send, any one of: { steps: [{subject, body_md}] } | { subject, body_md } | { campaign_id, position: number | "all" }
 * Everything goes out in ONE Resend batch request, so it can never trip the per-second limit.
 */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  const recipients = [...new Set(String(body.to ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length || recipients.some((r) => !EMAIL.test(r))) return NextResponse.json({ error: "Enter a valid email address. Separate several with commas." }, { status: 400 });
  if (recipients.length > 5) return NextResponse.json({ error: "Up to 5 addresses at a time." }, { status: 400 });

  let list: { subject: string; body_md: string }[] = [];
  if (Array.isArray(body.steps) && body.steps.length) {
    list = body.steps.filter((s: any) => typeof s?.subject === "string" && typeof s?.body_md === "string" && s.subject.trim() && s.body_md.trim());
  } else if (typeof body.subject === "string" && typeof body.body_md === "string" && body.subject.trim() && body.body_md.trim()) {
    list = [{ subject: body.subject, body_md: body.body_md }];
  } else if (body.campaign_id) {
    let q = supabaseAdmin().from("campaign_steps").select("subject, body_md, position").eq("campaign_id", body.campaign_id).order("position");
    if (body.position !== "all") q = q.eq("position", Number(body.position) || 1);
    const { data } = await q;
    list = data ?? [];
  }
  if (!list.length) return NextResponse.json({ error: "There is no email to test yet." }, { status: 404 });
  if (recipients.length * list.length > 15) return NextResponse.json({ error: "That is more than 15 test emails at once." }, { status: 400 });

  // Sample values stand in for a real contact, so you can see how the placeholders render.
  const emails: OutboundEmail[] = recipients.flatMap((to) => list.map((s, i) => {
    const vars = { company: "Sample Trucking LLC", state: "TX", power_units: 3, fleet_type: "Sample fleet", phone: null, email: to };
    const unsub = `${process.env.NEXT_PUBLIC_APP_URL}/api/u/${unsubscribeToken(to)}`;
    const bodyMd = fill(s.body_md, vars);
    const tag = list.length > 1 ? `[TEST ${i + 1}/${list.length}] ` : "[TEST] ";
    return { to, subject: tag + fill(s.subject, vars), html: renderHtml(bodyMd, unsub), text: renderText(bodyMd, unsub), unsubscribeUrl: unsub, tags: [{ name: "test", value: "true" }] };
  }));

  const { ids, error } = await sendBatchStrict(emails);
  // Remember each accepted test so the campaign page can show what Resend reports back (ignored if patch-005 has not been run).
  const rows = emails.map((e, k) => ({ resend_id: ids[k], to_email: e.to, subject: e.subject, campaign_id: body.campaign_id ?? null })).filter((r) => r.resend_id);
  if (rows.length) await supabaseAdmin().from("test_sends").insert(rows);
  const sent = ids.filter(Boolean).length;
  if (error || sent === 0) return NextResponse.json({ error: error ?? "Resend did not accept the emails." }, { status: 502 });
  return NextResponse.json({ ok: true, sent, failed: emails.length - sent });
}
