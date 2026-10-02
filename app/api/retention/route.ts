import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { fetchLapsed, tyLabel } from "@/lib/dash";

/** GET ?tax_year=&format=csv -> download the lapsed list. */
export async function GET(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ty = Number(new URL(req.url).searchParams.get("tax_year"));
  const rows = await fetchLapsed(ty - 1, ty);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Name,Email,Phone,Last Completed,Vehicles,Follow-up", ...rows.map((r) => [r.name, r.email, r.phone, r.last_filed_at, r.vehicles, r.in_sequence ? "In sequence" : r.lead_status ?? "Not contacted"].map(esc).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="lapsed-${tyLabel(ty)}.csv"` } });
}

/** POST { tax_year } -> create a draft renewal campaign and enroll every lapsed customer not already in a sequence. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tax_year: ty } = await req.json();
  const sb = supabaseAdmin();

  const { data: c, error } = await sb.from("campaigns").insert({ name: `Renewal \u00b7 filed ${tyLabel(ty - 1)}, not yet ${tyLabel(ty)}`, daily_cap: 500, kind: "renewal", target_tax_year: ty }).select().single();
  if (error || !c) return NextResponse.json({ error: error?.message }, { status: 500 });
  await sb.from("campaign_steps").insert([
    { campaign_id: c.id, position: 1, delay_days: 0, subject: `Your Form 2290 for ${tyLabel(ty)} \u2014 ready when you are`,
      body_md: `Hi there,\n\nThanks for filing your Form 2290 with TruckTaxPro last year. The ${tyLabel(ty)} tax period is open and your business details are already saved, so this year's return takes about five minutes.\n\n[Sign in and file ${tyLabel(ty)}](https://trucktaxpro.com)\n\nYour stamped Schedule 1 comes back the same day. Reply here if anything has changed with your fleet.` },
    { campaign_id: c.id, position: 2, delay_days: 7, subject: `Reminder: ${tyLabel(ty)} Form 2290`,
      body_md: `Quick reminder that your ${tyLabel(ty)} Form 2290 hasn't been filed with us yet.\n\nIf you filed elsewhere, ignore this. If not, everything from last year is pre-filled: [File now](https://trucktaxpro.com)` },
    { campaign_id: c.id, position: 3, delay_days: 10, subject: `Last reminder for ${tyLabel(ty)}`,
      body_md: `Last note from me. Late 2290 filings can accrue IRS penalties and interest, and the DMV needs the stamped Schedule 1 for plate renewal.\n\n[File ${tyLabel(ty)} now](https://trucktaxpro.com) \u2014 or reply and we'll help.` },
  ]);

  const { data: enrolled, error: ee } = await sb.rpc("enroll_lapsed", { p_campaign_id: c.id, p_prev: ty - 1, p_curr: ty });
  if (ee || !enrolled) {
    await sb.from("campaigns").delete().eq("id", c.id);
    return NextResponse.json({ error: ee ? `${ee.message}. Did you run supabase/patch-002.sql?` : "Everyone on the list is already in a sequence or unsubscribed." }, { status: 400 });
  }
  return NextResponse.json({ id: c.id, enrolled });
}
