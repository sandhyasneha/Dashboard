import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { fetchCohort, tyLabel } from "@/lib/dash";
import { MONTH_NAMES, cohortWords, createRenewalCampaign, fillPlaceholders, loadSteps } from "@/lib/retention";

const monthOf = (v: unknown) => { const m = Math.floor(Number(v)); return m >= 1 && m <= 12 ? m : null; };

/** GET ?ty=&m=&format=csv -> download the customers in a retention group. */
export async function GET(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = new URL(req.url).searchParams; const ty = Number(q.get("ty")); const m = monthOf(q.get("m"));
  const rows = await fetchCohort(ty, m);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Name,Email,Phone,Filed,Vehicles,Source,Filed again,Filed again on,Follow-up", ...rows.map((r) => [
    r.name, r.email, r.phone, r.cohort_at?.slice(0, 10), r.vehicles, r.source, r.returned ? "Yes" : "No", r.returned_at?.slice(0, 10),
    r.in_sequence ? "In sequence" : r.lead_status ?? "Not contacted"].map(esc).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="retention-${tyLabel(ty)}${m ? "-" + MONTH_NAMES[m - 1].slice(0, 3) : ""}.csv"` } });
}

/** POST { tax_year, month } -> a draft renewal campaign for the customers in that group who have not filed again. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json(); const ty = Math.floor(Number(b.tax_year)); const month = monthOf(b.month);
  if (!ty) return NextResponse.json({ error: "tax_year is required" }, { status: 400 });
  const { data: cfg } = await supabaseAdmin().from("retention_auto").select("steps, daily_cap").eq("id", 1).maybeSingle();
  const words = cohortWords(ty, month);
  const steps = loadSteps(cfg?.steps).map((s) => ({ ...s, subject: fillPlaceholders(s.subject, words), body_md: fillPlaceholders(s.body_md, words) }));
  try {
    const r = await createRenewalCampaign({ name: `Renewal · filed ${month ? MONTH_NAMES[month - 1] + " " : ""}${tyLabel(ty)}, not yet ${tyLabel(ty + 1)}`, cohortTaxYear: ty, month, steps, dailyCap: cfg?.daily_cap ?? 50, autoSource: null, status: "draft" });
    if (!r.id) return NextResponse.json({ error: "Everyone in this group has already filed again, is already in a sequence, or has unsubscribed." }, { status: 400 });
    return NextResponse.json({ id: r.id, enrolled: r.enrolled });
  } catch (e: any) { return NextResponse.json({ error: String(e.message ?? e) }, { status: 500 }); }
}
