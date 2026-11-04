"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type HeldBot = { user_id: number; name: string | null; email: string; phone: string | null; registered_at: string | null; reason: string };

/** Sign-ups held back as likely bots, newest first, each with a Not a bot button. */
export function BotSignups({ rows, total, week }: { rows: HeldBot[]; total: number; week: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState<number | null>(null); const [err, setErr] = useState("");
  async function release(id: number) {
    setBusy(id); setErr("");
    const res = await fetch("/api/bots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: id }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setErr(j.error ?? "Something went wrong."); else router.refresh();
    setBusy(null);
  }
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " CT" : "—";
  return (
    <section className="panel p-5 mb-6">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-semibold">Held back as likely bots: {total.toLocaleString()} <span className="text-muted font-normal">({week} in the last 7 days)</span></div>
          <p className="text-sm text-muted mt-1">Sign-ups with a scrambled name (like &ldquo;Hmrr Spbnxjtm&rdquo;) that has nothing to do with the email address are kept out of Customers, reminders and counts, and are never emailed. Anyone who starts or files a return is never held back. If a real person is here, press Not a bot.</p>
        </div>
        {rows.length > 0 && <button className="btn-secondary shrink-0" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>}
      </div>
      {err && <p className="text-sm text-red-700 mt-2">{err}</p>}
      {open && (
        <div className="overflow-x-auto mt-4">
          <table className="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Signed up</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.user_id} title={r.reason}>
                <td>{r.name ?? "—"}</td><td className="text-muted">{r.email}</td><td className="text-muted whitespace-nowrap">{r.phone ?? "—"}</td>
                <td className="text-muted whitespace-nowrap">{fmt(r.registered_at)}</td>
                <td><button className="btn-secondary" disabled={busy !== null} onClick={() => release(r.user_id)}>{busy === r.user_id ? "Moving…" : "Not a bot"}</button></td>
              </tr>))}
            </tbody></table>
          {total > rows.length && <p className="text-xs text-muted mt-2">Showing the latest {rows.length}.</p>}
        </div>
      )}
    </section>
  );
}
