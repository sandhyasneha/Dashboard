import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/") || path.startsWith("/login") || path.startsWith("/auth/")) return res;
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getUser();
  if (!data.user) {
    const stale = req.cookies.getAll().filter((c) => c.name.startsWith("sb-"));
    // A cookie existed but Supabase rejected it: tell the login page why. A first-time visitor just gets the plain form.
    const out = NextResponse.redirect(new URL(stale.length ? "/login?reason=session" : "/login", req.url));
    stale.forEach((c) => out.cookies.delete(c.name));
    return out;
  }
  return res;
}
export const config = { matcher: ["/((?!_next|favicon.ico|brand/).*)"] };
