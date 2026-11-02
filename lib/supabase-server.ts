import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Next.js 14 keeps the answer to a GET request in its Data Cache, even in routes marked force-dynamic, and Vercel keeps that
 * cache across deployments. Database reads go out as GET requests, so without this the scheduled jobs (sender, sync alert,
 * reminders, daily report) kept reading old answers: the sender saw "no campaign running" and the sync alert saw an old sync.
 * Every database request now asks for a fresh answer.
 */
const noStore: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

/** Session-aware client for pages and route handlers (respects the logged-in user). */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { fetch: noStore },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
          try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only in server components */ }
        },
      },
    }
  );
}

/** Service-role client for server-only work (imports, cron, webhooks). Never ship to the browser. */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false }, global: { fetch: noStore } }
  );
}
