"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Settings: the one switch that stops every campaign email. */
export function HoldSwitch({ hold, changedAt, missing }: { hold: boolean; changedAt: string | null; missing?: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function set(next: boolean) {
    const q = next
      ? "Put ALL sending on hold? No campaign email goes out until you release it. Test emails still work."
      : "Release the hold? Running campaigns, including automatic reminders, start sending at the next run (weekdays, 9 AM to 5 PM Central). Only do this once Marketing has confirmed.";
    if (!confirm(q)) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/hold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hold: next }) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setErr(j.error ?? "Could not change it."); return; }
    router.refresh();
  }
  return (
    <section className={`panel p-6 ${hold ? "border-amber" : ""}`}>
      <h2 className="font-semibold mb-1">Hold all sending</h2>
      {missing ? <p className="text-sm bg-amberSoft rounded-md p-3">Run <code>supabase/patch-013.sql</code> in Supabase to add this switch. Until then, the sender treats sending as held.</p> : <>
        <p className="text-sm mb-3">{hold
          ? <><strong className="text-amber">On hold.</strong> No campaign email is sent, and scheduled campaigns wait. Test emails still work.</>
          : <><strong className="text-sign">Sending allowed.</strong> Running campaigns send within the usual hours and limits.</>}
          {changedAt && <span className="text-muted"> Changed {new Date(changedAt).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} CT.</span>}</p>
        {hold
          ? <button className="btn-secondary" disabled={busy} onClick={() => set(false)}>Release the hold</button>
          : <button className="btn-danger" disabled={busy} onClick={() => set(true)}>Hold all sending</button>}
        {err && <p className="text-sm text-brick mt-2">{err}</p>}
      </>}
    </section>
  );
}
