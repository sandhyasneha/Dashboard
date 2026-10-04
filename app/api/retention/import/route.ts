import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** POST { rows: [{ email, filed_on: "yyyy-mm-dd" }], source } -> adds past filers who are not in the system to the retention groups. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rows, source } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });
  const seen = new Set<string>(); const clean: { email: string; filed_on: string; source: string | null }[] = []; let invalid = 0;
  for (const r of rows) {
    const email = String(r?.email ?? "").trim().toLowerCase(); const filed_on = String(r?.filed_on ?? "").trim();
    const ok = EMAIL.test(email) && DATE.test(filed_on) && !isNaN(new Date(filed_on + "T00:00:00Z").getTime());
    const key = email + "|" + filed_on;
    if (!ok) { invalid++; continue; }
    if (!seen.has(key)) { seen.add(key); clean.push({ email, filed_on, source: source ? String(source).slice(0, 80) : null }); }
  }
  if (clean.length) {
    const { error } = await supabaseAdmin().from("retention_imports").upsert(clean, { onConflict: "email,filed_on", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-008.sql?)" }, { status: 500 });
  }
  return NextResponse.json({ received: rows.length, saved: clean.length, invalid });
}
