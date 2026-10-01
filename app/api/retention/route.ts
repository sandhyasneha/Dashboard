import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { tyLabel } from "@/lib/dash";

async function lapsed(ty: number) {
  const { data } = await supabaseAdmin().rpc("dash_lapsed", { p_prev: ty - 1, p_curr: ty });
  return (data ?? []) as any[];
}

/** GET ?tax_year=&format=csv → download the lapsed list. */
export async function GET(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ty = Number(new URL(req.url).searchParams.get("tax_year"));
  const rows = await lapsed(ty);
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["Name,Email,Phone,Last Completed,Vehicles,Follow-up", ...rows.map((r) => [r.name, r.email, r.phone, r.last_filed_at, r.vehicles, r.in_sequence ? "In sequence" : r.lead_status ?? "Not contacted"].map(esc).join(","))].join("\n");
  return new NextResponse(csv, { headers: { "content-type": "text/csv", "content-disposition": `attachment; filename="lapsed-${tyLabel(ty)}.csv"` } });
}

/** POST { tax_year } → create a draft renewal campaign and enroll every lapsed customer not already in a sequence. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { tax_year: ty } = await req.json();
  const sb = supabaseAdmin();
  const rows = (await lapsed(ty)).filter((r) => !r.in_sequence && r.lead_status !== "unsubscribed" && r.lead_status !== "bounced" && r.lead_status !== "complained");
  if (!rows.length) return NextResponse.json({ error: "Everyone on the list is already in a sequence or unsubscribed." }, { status: 400 });

  // Make sure each lapsed customer exists as a lead (they came from production, not an FMCSA file).
  await sb.from("leads").upsert(rows.map((r) => ({ email: r.email, company_name: r.name, phone: r.phone, carrier_type: "Returning customer", source_file: `lapsed ${tyLabel(ty - 1)}` })), { onConflict: "email", ignoreDuplicates: true });
  const { data: leads } = await sb.from("leads").select("id").in("email", rows.map((r) => r.email));

  const { data: c, error } = await sb.from("campaigns").insert({ name: `Renewal · filed ${tyLabel(ty - 1)}, not yet ${tyLabel(ty)}`, daily_cap: 500, kind: "renewal", target_tax_year: ty }).select().single();
  if (error || !c) return NextResponse.json({ error: error?.message }, { status: 500 });
  await sb.from("campaign_steps").insert([
    { campaign_id: c.id, position: 1, delay_days: 0, subject: `Your Form 2290 for ${tyLabel(ty)} — ready when you are`,
      body_md: `Hi {{company}},\n\nThanks for filing your Form 2290 with TruckTaxPro last year. The ${tyLabel(ty)} tax period is open and your business details are already saved, so this year's return takes about five minutes.\n\n[Sign in and file ${tyLabel(ty)}](https://trucktaxpro.com)\n\nYour stamped Schedule 1 comes back the same day. Reply here if anything has changed with your fleet.` },
    { campaign_id: c.id, position: 2, delay_days: 7, subject: `Reminder: ${tyLabel(ty)} Form 2290`,
      body_md: `Quick reminder that your ${tyLabel(ty)} Form 2290 hasn't been filed yet with us.\n\nIf you filed elsewhere, ignore this. If not, everything from last year is pre-filled: [File now](https://trucktaxpro.com)` },
    { campaign_id: c.id, position: 3, delay_days: 10, subject: `Last reminder for ${tyLabel(ty)}`,
      body_md: `Last note from me. Late 2290 filings accrue penalties and interest each month, and the DMV needs the stamped Schedule 1 for plate renewal.\n\n[File ${tyLabel(ty)} now](https://trucktaxpro.com) — or reply and we'll help.` },
  ]);
  await sb.from("enrollments").upsert((leads ?? []).map((l) => ({ campaign_id: c.id, lead_id: l.id, next_send_at: new Date().toISOString() })), { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
  return NextResponse.json({ id: c.id, enrolled: leads?.length ?? 0 });
}
