"use client";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const notices: Record<string, string> = {
  session: "You signed in, but the server did not accept the session. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel belong to the same Supabase project as this user, then redeploy.",
  "not-admin": "That account signed in, but its email is not listed in ADMIN_EMAILS in Vercel.",
};

export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const r = p.get("reason");
    if (r && notices[r]) setNotice(notices[r] + (p.get("as") ? ` Signed in as: ${p.get("as")}` : ""));
    // Clear any old session on this device so a stale cookie can't interfere with a fresh sign-in.
    createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!).auth.signOut({ scope: "local" });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setNotice(""); setBusy(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(error.message); return; }
    window.location.assign("/"); // full page load so the new cookies are sent with the very first request
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/logo.png" alt="TruckTaxPro" className="w-full h-auto rounded-md block mb-6" />
        {notice && <p className="text-sm bg-amberSoft text-ink rounded-md p-3 mb-4">{notice}</p>}
        <label className="label" htmlFor="email">Email</label>
        <input id="email" className="input mb-4" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label" htmlFor="pw">Password</label>
        <input id="pw" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="text-sm text-brick mt-3">{err}</p>}
        <button className="btn-primary w-full justify-center mt-5" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
