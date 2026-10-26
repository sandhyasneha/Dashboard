import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runSyncAlert } from "@/lib/syncAlert";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Daily, a few hours after the 6:00 AM sync: emails the admins if the sync failed, is stuck, or has not run. */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  try { return NextResponse.json(await runSyncAlert()); } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 }); }
}
