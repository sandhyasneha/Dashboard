import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runDailyReport } from "@/lib/dailyReport";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";   // never reuse an old database answer in a scheduled job

/** Daily at 9:00 AM India time: one email saying whether the sync and the sender are healthy and what each campaign did. */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  try { return NextResponse.json(await runDailyReport()); } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 }); }
}
