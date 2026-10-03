import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { supabaseAdmin } from "@/lib/supabase-server";

/** Resend event webhook. In Resend: Webhooks > Add > https://<app>/api/webhooks/resend, copy the signing secret to RESEND_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  const payload = await req.text();
  const h = req.headers;
  try {
    new Webhook(process.env.RESEND_WEBHOOK_SECRET!).verify(payload, {
      "svix-id": h.get("svix-id") ?? "", "svix-timestamp": h.get("svix-timestamp") ?? "", "svix-signature": h.get("svix-signature") ?? "",
    });
  } catch { return NextResponse.json({ error: "bad signature" }, { status: 400 }); }

  const evt = JSON.parse(payload);
  const type: string = evt.type;                       // email.sent | delivered | opened | clicked | bounced | complained
  const resendId: string | undefined = evt.data?.email_id;
  const to: string = String(evt.data?.to?.[0] ?? "").toLowerCase();
  const at: string = evt.created_at ?? new Date().toISOString();
  const sb = supabaseAdmin();
  await sb.from("email_events").insert({ resend_id: resendId, type, payload: evt });

  const col: Record<string, string> = {
    "email.delivered": "delivered_at", "email.opened": "opened_at", "email.clicked": "clicked_at",
    "email.bounced": "bounced_at", "email.complained": "complained_at",
  };
  if (resendId && col[type]) {
    await sb.from("messages").update({ [col[type]]: at, last_event: type.replace("email.", "") }).eq("resend_id", resendId);
    await sb.from("test_sends").update({ [col[type]]: at, last_event: type.replace("email.", "") }).eq("resend_id", resendId);
  }
  if (to && (type === "email.bounced" || type === "email.complained")) {
    const reason = type === "email.bounced" ? "bounced" : "complained";
    await sb.from("suppressions").upsert({ email: to, reason });
    const { data: lead } = await sb.from("leads").update({ status: reason }).eq("email", to).select("id").maybeSingle();
    if (lead) await sb.from("enrollments").update({ status: "exited_bounce" }).eq("lead_id", lead.id).eq("status", "active");
  }
  return NextResponse.json({ ok: true });
}
