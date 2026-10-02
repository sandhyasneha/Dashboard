import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

type Step = { subject: string; body_md: string; delay_days: number };

/** Create a campaign with its steps, then enroll every matching lead (done in SQL, so thousands of rows are fine). */
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
    filter_min_units: body.filter_min_units ?? null, filter_max_units: body.filter_max_units ?? null,
  }).select().single();
  if (error || !c) return NextResponse.json({ error: error?.message }, { status: 500 });

  const steps = (body.steps as Step[]).map((s, i) => ({
    campaign_id: c.id, position: i + 1, subject: s.subject, body_md: s.body_md, delay_days: i === 0 ? 0 : Number(s.delay_days) || 0,
  }));
  const { error: se } = await sb.from("campaign_steps").insert(steps);
  if (se) return NextResponse.json({ error: se.message }, { status: 500 });

  const { data: enrolled, error: ee } = await sb.rpc("enroll_campaign", { p_campaign_id: c.id });
  if (ee) return NextResponse.json({ error: `Campaign created but enrolment failed: ${ee.message}. Did you run supabase/patch-002.sql?` }, { status: 500 });
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
