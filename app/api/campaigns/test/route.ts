import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { resend } from "@/lib/resend";
import { fill, renderHtml, renderText, unsubscribeToken } from "@/lib/template";

/** POST { campaign_id, position, to } -> sends one step of a campaign to one address, right now.
 *  Enrolls nobody and records nothing against the campaign. Works any day and hour. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { campaign_id, position, to, subject, body_md } = await req.json();
  const email = String(to ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  // Either the draft text typed in the builder, or a saved campaign step.
  let step: { subject: string; body_md: string } | null = null;
  if (typeof subject === "string" && typeof body_md === "string" && subject.trim() && body_md.trim()) step = { subject, body_md };
  else {
    const { data } = await supabaseAdmin().from("campaign_steps").select("subject, body_md")
      .eq("campaign_id", campaign_id).eq("position", Number(position) || 1).maybeSingle();
    step = data;
  }
  if (!step) return NextResponse.json({ error: "That email wasn't found." }, { status: 404 });

  // Sample values stand in for a real contact, so you can see how the placeholders render.
  const sample = { company: "Sample Trucking LLC", state: "TX", power_units: 3, fleet_type: "Sample fleet", phone: null, email };
  const unsub = `${process.env.NEXT_PUBLIC_APP_URL}/api/u/${unsubscribeToken(email)}`;
  const body = fill(step.body_md, sample);

  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM!,
    to: [email],
    replyTo: process.env.EMAIL_REPLY_TO,
    subject: "[TEST] " + fill(step.subject, sample),
    html: renderHtml(body, unsub),
    text: renderText(body, unsub),
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "test", value: "true" }],
  });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Resend did not accept the email." }, { status: 502 });
  return NextResponse.json({ ok: true, id: data.id });
}
