import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Body: { rows: Array<Record<string,string>>, source_file: string }. The browser sends chunks of ~500 rows. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, source_file } = await req.json();
  if (!Array.isArray(rows)) return NextResponse.json({ error: "rows must be an array" }, { status: 400 });

  const pick = (r: Record<string, any>, keys: string[]) => {
    for (const k of Object.keys(r)) if (keys.includes(k.trim().toLowerCase())) return r[k];
    return undefined;
  };

  const seen = new Set<string>();
  const clean = rows.flatMap((r: Record<string, any>) => {
    const email = String(pick(r, ["contact email", "email", "email_address"]) ?? "").trim().toLowerCase();
    if (!EMAIL.test(email) || seen.has(email)) return [];
    seen.add(email);
    const units = parseInt(String(pick(r, ["power units", "nbr_power_unit"]) ?? ""), 10);
    const fleet = pick(r, ["fleet type"]) ?? null;
    const usdot = pick(r, ["usdot number", "dot_number"]);
    return [{
      email,
      company_name: pick(r, ["company name", "legal_name", "dba_name"]) ?? null,
      phone: pick(r, ["phone number", "telephone", "phone"]) ?? null,
      fleet_type: fleet,
      carrier_type: pick(r, ["carrier type"]) ?? (fleet ? String(fleet).split(" - ")[0] : null),
      power_units: Number.isFinite(units) ? units : null,
      state: pick(r, ["state", "phy_state"]) ?? null,
      usdot: usdot != null ? String(usdot) : null,
      source_file: source_file ?? null,
    }];
  });
  if (clean.length === 0) return NextResponse.json({ received: rows.length, valid: 0, suppressed: 0, inserted: 0, updated: 0 });

  const sb = supabaseAdmin();
  const emails = clean.map((c) => c.email);
  const [{ data: sup }, { data: existing }] = await Promise.all([
    sb.from("suppressions").select("email").in("email", emails),
    sb.from("leads").select("email").in("email", emails),
  ]);
  const suppressed = new Set((sup ?? []).map((s) => s.email));
  const existingSet = new Set((existing ?? []).map((e) => e.email));
  const toUpsert = clean.filter((c) => !suppressed.has(c.email));

  const { error } = await sb.from("leads").upsert(toUpsert, { onConflict: "email" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = toUpsert.filter((c) => existingSet.has(c.email)).length;
  return NextResponse.json({ received: rows.length, valid: clean.length, suppressed: suppressed.size, inserted: toUpsert.length - updated, updated });
}
