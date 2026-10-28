import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

type Step = { subject: string; body_md: string; delay_days: number };
const signedIn = async () => (await supabaseServer().auth.getUser()).data.user;
const isId = (v: unknown) => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);

/** Cleans what the browser sent: 1 to 10 emails, each with a subject and text; the first is sent on day 0. */
function cleanSteps(raw: unknown): Step[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 10) return null;
  const steps = raw.map((s: any, i: number) => ({
    subject: String(s?.subject ?? "").trim().slice(0, 200), body_md: String(s?.body_md ?? "").trim().slice(0, 20000),
    delay_days: i === 0 ? 0 : Math.min(60, Math.max(1, Math.floor(Number(s?.delay_days) || 4))),
  }));
  return steps.every((s) => s.subject && s.body_md) ? steps : null;
}

/** POST { id?, name, description?, steps } -> creates a template, or updates it when id is given. */
export async function POST(req: Request) {
  const user = await signedIn(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 80);
  const steps = cleanSteps(b.steps);
  if (!name) return NextResponse.json({ error: "Give the template a name." }, { status: 400 });
  if (!steps) return NextResponse.json({ error: "Every email needs a subject and some text (up to 10 emails)." }, { status: 400 });
  const row = { name, description: String(b.description ?? "").trim().slice(0, 200) || null, steps, updated_at: new Date().toISOString() };
  const sb = supabaseAdmin();
  const { data, error } = isId(b.id)
    ? await sb.from("email_templates").update(row).eq("id", b.id).select("id").single()
    : await sb.from("email_templates").insert({ ...row, created_by: user.email }).select("id").single();
  if (error) {
    const msg = /duplicate|unique/i.test(error.message) ? "A template with that name already exists. Choose another name." : error.message + " (Did you run supabase/patch-015.sql?)";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}

/** DELETE { id } -> deletes one of your templates. Campaigns already made from it are not affected. */
export async function DELETE(req: Request) {
  if (!(await signedIn())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json().catch(() => ({}));
  if (!isId(id)) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await supabaseAdmin().from("email_templates").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
