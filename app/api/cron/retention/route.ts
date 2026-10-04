import { NextResponse } from "next/server";
import { requireCron } from "@/lib/auth";
import { runMonthlyRetention } from "@/lib/retention";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Daily check. It only does something once a month, on the day set in Retention, and only if monthly renewals are switched on. */
export async function GET(req: Request) {
  const denied = requireCron(req); if (denied) return denied;
  try { return NextResponse.json(await runMonthlyRetention()); } catch (e: any) { return NextResponse.json({ ok: false, error: String(e.message ?? e) }, { status: 500 }); }
}
