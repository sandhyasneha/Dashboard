import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

/**
 * Call this from trucktaxpro.com when a user registers or files a return.
 *   POST https://<app>/api/webhooks/trucktaxpro
 *   Authorization: Bearer <TTP_WEBHOOK_SECRET>
 *   { "email": "owner@carrier.com", "event": "registered" | "filed", "occurred_at": "2026-09-12T10:00:00Z" }
 */
export async function POST(req: Request) {
  if (!process.env.TTP_WEBHOOK_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.TTP_WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { email, event, occurred_at } = await req.json();
  if (!email || !["registered", "filed"].includes(event)) return NextResponse.json({ error: "email and event required" }, { status: 400 });
  const at = occurred_at ?? new Date().toISOString();
  const sb = supabaseAdmin();
  await sb.from("customer_events").insert({ email: String(email).toLowerCase(), event, occurred_at: at, source: "webhook" });
  await sb.rpc("mark_customer", { p_email: email, p_event: event, p_at: at });
  return NextResponse.json({ ok: true });
}
