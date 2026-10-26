import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { runSyncAlert } from "@/lib/syncAlert";

export const dynamic = "force-dynamic";

/** POST -> sends a sample sync alert to the alert recipients, so you can see that it arrives. Changes nothing. */
export async function POST() {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await runSyncAlert({ test: true });
    return r.ok ? NextResponse.json(r) : NextResponse.json({ error: r.message }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 }); }
}
