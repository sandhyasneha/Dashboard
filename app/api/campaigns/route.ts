import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

type Step = { subject: string; body_md: string; delay_days: number };

/** Create a campaign with its steps, then enroll every matching lead. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "name and at least one step are required" }, { status: 400 });
  }
  const sb = supabaseAdmin();

  const { data: c, error } = await sb.from("campaigns").insert({
    name: body.name, daily_cap: body.daily_cap ?? 800,
    filter_states: body.filter_states ?? [], filter_carrier_types: body.filter_carrier_types ?? [],
    filter_min_units: body.filter_min_units ?? 1, filter_max_units: body.filter_max_units ?? 200,
  }).select().single();
  if (error || !c) return NextResponse.json({ error: error?.message }, { status: 500 });

  const steps = (body.steps as Step[]).map((s, i) => ({
    campaign_id: c.id, position: i + 1, subject: s.subject, body_md: s.body_md, delay_days: i === 0 ? 0 : Number(s.delay_days) || 0,
  }));
  const { error: se } = await sb.from("campaign_steps").insert(steps);
  if (se) return NextResponse.json({ error: se.message }, { status: 500 });

  // Enroll matching leads in pages of 1000.
  let enrolled = 0, from = 0; const page = 1000;
  while (true) {
    let q = sb.from("leads").select("id").eq("is_customer", false).eq("status", "new")
      .gte("power_units", c.filter_min_units).lte("power_units", c.filter_max_units);
    if (c.filter_states?.length) q = q.in("state", c.filter_states);
    if (c.filter_carrier_types?.length) q = q.in("carrier_type", c.filter_carrier_types);
    const { data: leads } = await q.order("created_at").range(from, from + page - 1);
    if (!leads || leads.length === 0) break;
    const rows = leads.map((l) => ({ campaign_id: c.id, lead_id: l.id, next_send_at: new Date().toISOString() }));
    await sb.from("enrollments").upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
    await sb.from("leads").update({ status: "in_sequence" }).in("id", leads.map((l) => l.id));
    enrolled += leads.length;
    if (leads.length < page) break;
    // Leads just moved to in_sequence, so the next page starts at 0 again.
  }
  return NextResponse.json({ id: c.id, enrolled });
}

/** Change status: running | paused | completed */
export async function PATCH(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status } = await req.json();
  if (!["running", "paused", "completed"].includes(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
  const { error } = await supabaseAdmin().from("campaigns").update({ status }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
