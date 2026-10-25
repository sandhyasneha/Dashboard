import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

/**
 * POST { rows: [{ email, filed_on: "yyyy-mm-dd", name?, company?, phone?, registered_at?, first_used_month? }], source }
 * Adds past filers who are not in the system. They join the Retention groups and the Customers list.
 */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rows, source } = await req.json();
  if (!Array.isArray(rows) || rows.length > 1000) return NextResponse.json({ error: "rows must be an array of at most 1,000" }, { status: 400 });
  const byKey = new Map<string, Record<string, unknown>>(); let invalid = 0;
  for (const r of rows) {
    const email = String(r?.email ?? "").trim().toLowerCase(); const filed_on = String(r?.filed_on ?? "").trim();
    if (!EMAIL.test(email) || !DATE.test(filed_on) || isNaN(new Date(filed_on + "T00:00:00Z").getTime())) { invalid++; continue; }
    const reg = r?.registered_at ? new Date(String(r.registered_at)) : null;
    const fum = Math.floor(Number(r?.first_used_month));
    byKey.set(email + "|" + filed_on, {                              // the same customer and date twice in one file: the later row wins
      email, filed_on, name: text(r?.name, 120), company: text(r?.company, 200), phone: text(r?.phone, 40),
      registered_at: reg && !isNaN(reg.getTime()) ? reg.toISOString() : null,
      first_used_month: fum >= 1 && fum <= 12 ? fum : null,
    });
  }
  const clean = [...byKey.values()];
  if (clean.length) {
    const { error } = await supabaseAdmin().rpc("import_past_filers", { p_rows: clean, p_source: source ? String(source).slice(0, 80) : null });
    if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-011.sql?)" }, { status: 500 });
  }
  return NextResponse.json({ received: rows.length, saved: clean.length, invalid });
}
