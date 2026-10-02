import { redirect } from "next/navigation";
import { supabaseServer } from "./supabase-server";

/** Only the configured admin address may use the app, even if other users exist in Supabase Auth. */
export async function requireUser() {
  const sb = supabaseServer();
  const { data } = await sb.auth.getUser();
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!data.user || (allowed.length && !allowed.includes((data.user.email ?? "").toLowerCase()))) {
    redirect("/login");
  }
  return data.user;
}

export function requireCron(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
