import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { applyConfigToCampaigns, loadReminderConfig, runReminders } from "@/lib/reminders";

/** POST { enabled, daily_cap, steps: { registered, unpaid }, run? } -> saves the reminder settings; run: true also adds today's people now. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json();
  for (const g of ["registered", "unpaid"]) {
    const steps = b?.steps?.[g];
    if (!Array.isArray(steps) || !steps.length || steps.some((s: any) => !String(s?.subject ?? "").trim() || !String(s?.body_md ?? "").trim()))
      return NextResponse.json({ error: "Every email needs a title and some text." }, { status: 400 });
  }
  const cfg = loadReminderConfig(b);
  const { error } = await supabaseAdmin().from("settings").update({ reminders: cfg, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-013.sql?)" }, { status: 500 });
  try {
    await applyConfigToCampaigns(cfg);
    if (!b.run) return NextResponse.json({ ok: true, message: "Saved." });
    return NextResponse.json(await runReminders({ force: true }));
  } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 }); }
}
