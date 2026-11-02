import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { runDailyReport } from "@/lib/dailyReport";

export const dynamic = "force-dynamic";

/** POST -> sends today's report now (Settings button). */
export async function POST() {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runDailyReport({ force: true })); } catch (e: any) { return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 }); }
}
