import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runReminders } from "@/lib/reminders";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Daily, after the morning sync: adds the people who qualify today to the reminder campaigns (only when switched on). */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  try { return NextResponse.json(await runReminders()); } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 }); }
}
