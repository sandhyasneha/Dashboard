import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

type Step = { subject: string; body_md: string; delay_days: number };

/** Create a campaign with its steps, enroll matching leads, then draft it, start it now, or schedule it. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (!body.name || !Array.isArray(body.steps) || body.steps.length === 0) {
    return NextResponse.json({ error: "name and at least one step are required" }, { status: 400 });
  }
  const mode: "draft" | "now" | "schedule" = body.mode === "now" ? "now" : body.mode === "schedule" ? "schedule" : "draft";
  let scheduledAt: Date | null = null;
  if (mode === "schedule") {
    scheduledAt = new Date(body.scheduled_at);
    if (isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Pick a valid date and time to schedule." }, { status: 400 });
  }
  const cap = Math.max(1, Math.floor(Number(body.daily_cap) || 50));
  const limit = body.max_contacts ? Math.max(1, Math.floor(Number(body.max_contacts))) : null;
  const sb = supabaseAdmin();

  const { data: c, error } = await sb.from("campaigns").insert({
    name: body.name, daily_cap: cap,
    filter_states: body.filter_states ?? [], filter_carrier_types: body.filter_carrier_types ?? [],
    filter_min_units: body.filter_min_units ?? null, filter_max_units: body.filter_max_units ?? null,
  }).select().single();
  if (error || !c) return NextResponse.json({ error: error?.message }, { status: 500 });

  const steps = (body.steps as Step[]).map((s, i) => ({
    campaign_id: c.id, position: i + 1, subject: s.subject, body_md: s.body_md, delay_days: i === 0 ? 0 : Number(s.delay_days) || 0,
  }));
  const { error: se } = await sb.from("campaign_steps").insert(steps);
  if (se) return NextResponse.json({ error: se.message }, { status: 500 });

  const { data: enrolled, error: ee } = await sb.rpc("enroll_campaign", { p_campaign_id: c.id, p_limit: limit });
  if (ee) return NextResponse.json({ error: `Campaign saved as a draft, but enrolment failed: ${ee.message}. Did you run supabase/patch-003.sql?` }, { status: 500 });

  let status = "draft";
  if (mode === "now" || (scheduledAt && scheduledAt <= new Date())) status = "running";
  else if (mode === "schedule") status = "scheduled";
  await sb.from("campaigns").update({ status, scheduled_at: status === "scheduled" ? scheduledAt!.toISOString() : null }).eq("id", c.id);
  return NextResponse.json({ id: c.id, enrolled, status });
}

/** Change status. For "scheduled" pass scheduled_at; a time that has already passed starts the campaign now. */
export async function PATCH(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, status, scheduled_at, daily_cap } = await req.json();
  if (daily_cap !== undefined) {
    const cap = Math.floor(Number(daily_cap));
    if (!(cap >= 1 && cap <= 5000)) return NextResponse.json({ error: "Enter a number between 1 and 5000." }, { status: 400 });
    const { error } = await supabaseAdmin().from("campaigns").update({ daily_cap: cap }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (!["draft", "scheduled", "running", "paused", "completed"].includes(status)) return NextResponse.json({ error: "bad status" }, { status: 400 });

  let next: Record<string, unknown> = { status };
  if (status === "scheduled") {
    const t = new Date(scheduled_at);
    if (isNaN(t.getTime())) return NextResponse.json({ error: "Pick a valid date and time." }, { status: 400 });
    next = t <= new Date() ? { status: "running", scheduled_at: null } : { status: "scheduled", scheduled_at: t.toISOString() };
  } else if (status === "running" || status === "draft") {
    next.scheduled_at = null;
  }
  const { error } = await supabaseAdmin().from("campaigns").update(next).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
