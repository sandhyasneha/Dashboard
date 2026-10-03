import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { chunk } from "@/lib/util";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Body: { rows: Array<Record<string,string>>, source_file: string }. The browser sends chunks of ~500 rows. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { rows, source_file } = body;
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const pick = (r: Record<string, any>, keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase())) return r[k];
    return undefined;
  };

  const listName = String(body.list_name ?? "").trim().slice(0, 60) || null;
  const seen = new Set<string>();
  const clean = rows.flatMap((r: Record<string, any>) => {
    const email = String(pick(r, ["contact email", "email", "email_address"]) ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) return [];
    seen.add(email);
    const phone = pick(r, ["phone number", "telephone", "phone"]);
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

  const { error } = await sb.from("leads").upsert(toUpsert, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = toUpsert.filter((c) => existingSet.has(c.email)).length;
  return NextResponse.json({ received: rows.length, valid: clean.length, suppressed: suppressed.size, inserted: toUpsert.length - updated, updated });
}
