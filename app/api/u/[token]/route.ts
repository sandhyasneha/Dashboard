import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { verifyUnsubscribeToken } from "@/lib/template";

async function unsubscribe(token: string) {
  const email = verifyUnsubscribeToken(token);
  if (!email) return false;
  const sb = supabaseAdmin();
  await sb.from("suppressions").upsert({ email, reason: "unsubscribed" });
  const { data: lead } = await sb.from("leads").update({ status: "unsubscribed" }).eq("email", email).select("id").maybeSingle();
  if (lead) await sb.from("enrollments").update({ status: "exited_unsub" }).eq("lead_id", lead.id).eq("status", "active");
  return true;
}
const page = (ok: boolean) => new NextResponse(
  `<!doctype html><html><body style="font-family:system-ui;background:#F6F7F4;color:#1B2431;display:grid;place-items:center;height:100vh;margin:0">
  <div style="max-width:420px;padding:32px;background:#fff;border:1px solid #D9DDD6"><h1 style="font-size:20px;margin:0 0 8px">${ok ? "You're unsubscribed" : "That link isn't valid"}</h1>
  <p style="margin:0;color:#5B6573">${ok ? "You won't get any more emails from TruckTaxPro." : "The link may have been altered. Reply to any of our emails and we'll remove you by hand."}</p></div></body></html>`,
  { headers: { "content-type": "text/html" } });

export async function GET(_: Request, { params }: { params: { token: string } }) { return page(await unsubscribe(params.token)); }
/** RFC 8058 one-click unsubscribe: mail clients POST here. */
export async function POST(_: Request, { params }: { params: { token: string } }) { await unsubscribe(params.token); return NextResponse.json({ ok: true }); }
