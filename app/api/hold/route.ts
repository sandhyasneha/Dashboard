import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

/** POST { hold: boolean } -> turns "Hold all sending" on or off. While on, the sender sends nothing (test emails still work). */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { hold } = await req.json().catch(() => ({}));
  if (typeof hold !== "boolean") return NextResponse.json({ error: "hold must be true or false" }, { status: 400 });
  const sb = supabaseAdmin();
  const { error } = await sb.from("settings").update({ hold_all: hold, hold_changed_at: new Date().toISOString() }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-013.sql?)" }, { status: 500 });
  await sb.from("email_events").insert({ type: hold ? "hold.on" : "hold.off", payload: { by: u.user.email } });
  return NextResponse.json({ ok: true, hold });
}
