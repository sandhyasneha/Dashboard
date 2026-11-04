import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase-server";

/** POST { user_id } -> Not a bot: the sign-up goes back into Customers and can be emailed again. It is never held back again. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { user_id } = await req.json().catch(() => ({}));
  if (!Number.isInteger(user_id)) return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc("release_bot_signup", { p_user_id: user_id });
  if (error) return NextResponse.json({ error: error.message + " (Did you run supabase/patch-019.sql?)" }, { status: 500 });
  if (data !== "released") return NextResponse.json({ error: "That sign-up was not found." }, { status: 404 });
  await sb.from("email_events").insert({ type: "bot.released", payload: { user_id, by: u.user.email } });
  return NextResponse.json({ ok: true });
}
