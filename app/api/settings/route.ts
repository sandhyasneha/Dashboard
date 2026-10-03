import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const clean = (v: unknown) => Math.floor(Number(v));
  const row = { global_daily_cap: clean(b.global_daily_cap), peak_daily_cap: clean(b.peak_daily_cap), monthly_cap: clean(b.monthly_cap) };
  if (Object.values(row).some((v) => !(v >= 1))) return NextResponse.json({ error: "Each limit must be a whole number of at least 1." }, { status: 400 });
  const { error } = await supabaseAdmin().from("settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-004.sql?)" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
