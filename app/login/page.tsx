"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy(true);
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    const { error } = await sb.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { setErr("Email or password is incorrect."); return; }
    router.push("/"); router.refresh();
  }
  return (
    <div className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm p-8">
        <div className="flex items-center gap-2.5 mb-6"><span className="inline-block w-7 h-7 rounded-[3px] bg-sign" /><span className="font-bold">TruckTaxPro Admin</span></div>
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
