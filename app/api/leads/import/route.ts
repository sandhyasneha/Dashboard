import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { chunk } from "@/lib/util";
import { EMAIL_COLUMNS, PHONE_COLUMNS, findColumn } from "@/lib/importColumns";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Body: { rows: Array<Record<string,string>>, source_file: string }. The browser sends chunks of ~500 rows. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { rows, source_file } = body;
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const pick = (r: Record<string, any>, names: string[]) => { const k = findColumn(Object.keys(r), names); return k === undefined ? undefined : r[k]; };

  const listName = String(body.list_name ?? "").trim().slice(0, 60) || null;
  const seen = new Set<string>();
  const clean = rows.flatMap((r: Record<string, any>) => {
    const email = String(pick(r, EMAIL_COLUMNS) ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) return [];
    seen.add(email);
    const phone = pick(r, PHONE_COLUMNS);
    return [{ email, phone: phone ? String(phone).trim() || null : null, carrier_type: listName, source_file: source_file ?? null }];
  });
  if (clean.length === 0) return NextResponse.json({ received: rows.length, valid: 0, suppressed: 0, inserted: 0, updated: 0 });

  const sb = supabaseAdmin();
  const emails = clean.map((c) => c.email);
  const sup: { email: string }[] = []; const existing: { email: string }[] = [];
  for (const part of chunk(emails, 100)) { // long .in() lists exceed the URL limit, so look up 100 at a time
    const [a, b] = await Promise.all([sb.from("suppressions").select("email").in("email", part), sb.from("leads").select("email").in("email", part)]);
    sup.push(...(a.data ?? [])); existing.push(...(b.data ?? []));
  }
  const suppressed = new Set(sup.map((s) => s.email));
  const existingSet = new Set(existing.map((e) => e.email));
  const toUpsert = clean.filter((c) => !suppressed.has(c.email));

  // Every address in the file goes into this file's list, so a campaign can target exactly this file.
  // New addresses are added. Addresses already on file keep their other lists, status and history; they gain this list,
  // and a missing phone number is filled in.
  const fresh = toUpsert.filter((c) => !existingSet.has(c.email)).map((c) => ({ ...c, lists: listName ? [listName] : [] }));
  const known = toUpsert.filter((c) => existingSet.has(c.email));
  if (fresh.length) {
    const { error } = await sb.from("leads").upsert(fresh, { onConflict: "email", ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-016.sql?)" }, { status: 500 });
  }
  if (known.length && listName) {
    const { error } = await sb.rpc("add_leads_to_list", { p_emails: known.map((c) => c.email), p_list: listName });
    if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-016.sql?)" }, { status: 500 });
  }
  for (const c of known) {
    if (!c.phone) continue;
    await sb.from("leads").update({ phone: c.phone, updated_at: new Date().toISOString() }).eq("email", c.email).is("phone", null);
  }
  return NextResponse.json({ received: rows.length, valid: clean.length, suppressed: suppressed.size, inserted: fresh.length, updated: known.length });
}
