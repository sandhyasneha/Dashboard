import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { runMonthlyRetention } from "@/lib/retention";

/** POST { enabled, mode, send_day, daily_cap, steps, run? } -> saves the monthly renewal settings; run: true also creates this month's campaign now. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  const steps = Array.isArray(b.steps) ? b.steps : [];
  const good = steps.filter((s: any) => String(s?.subject ?? "").trim() && String(s?.body_md ?? "").trim());
  if (good.length === 0 || good.length !== steps.length) return NextResponse.json({ error: "Every email needs a title and some text." }, { status: 400 });
  const row = {
    enabled: !!b.enabled, mode: b.mode === "auto" ? "auto" : "review",
    send_day: Math.min(28, Math.max(1, Math.floor(Number(b.send_day) || 1))), daily_cap: Math.min(5000, Math.max(1, Math.floor(Number(b.daily_cap) || 50))),
    steps: good.map((s: any, i: number) => ({ subject: String(s.subject), body_md: String(s.body_md), delay_days: i === 0 ? 0 : Math.min(60, Math.max(1, Math.floor(Number(s.delay_days) || 7))) })),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin().from("retention_auto").update(row).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-008.sql?)" }, { status: 500 });
  if (!b.run) return NextResponse.json({ ok: true });
  try { return NextResponse.json(await runMonthlyRetention({ force: true })); } catch (e: any) { return NextResponse.json({ ok: false, message: String(e.message ?? e) }, { status: 500 }); }
}
