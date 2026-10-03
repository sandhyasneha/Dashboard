"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { centralLabel } from "@/lib/schedule";

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function CampaignControls({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [picking, setPicking] = useState(false);
  const [when, setWhen] = useState(""); const [err, setErr] = useState("");

  async function call(body: object) {
    setBusy(true); setErr("");
    const res = await fetch("/api/campaigns", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    if (!res.ok) setErr((await res.json()).error ?? "Something went wrong.");
    setPicking(false); router.refresh(); setBusy(false);
  }
  if (status === "completed") return null;
  const picked = when ? new Date(when) : null;

  return (
    <div className="relative">
      <div className="flex gap-2">
        {(status === "draft" || status === "scheduled") && <button className="btn-primary" disabled={busy} onClick={() => call({ status: "running" })}>Start now</button>}
        {status === "paused" && <button className="btn-primary" disabled={busy} onClick={() => call({ status: "running" })}>Resume</button>}
        {(status === "draft" || status === "scheduled") && <button className="btn-secondary" disabled={busy} onClick={() => setPicking(!picking)}>{status === "scheduled" ? "Reschedule…" : "Schedule…"}</button>}
        {status === "scheduled" && <button className="btn-secondary" disabled={busy} onClick={() => call({ status: "draft" })}>Cancel schedule</button>}
        {status === "running" && <button className="btn-secondary" disabled={busy} onClick={() => call({ status: "paused" })}>Pause</button>}
        {(status === "running" || status === "paused" || status === "scheduled") && <button className="btn-danger" disabled={busy} onClick={() => { if (confirm("End this campaign? Remaining emails won't be sent.")) call({ status: "completed" }); }}>End</button>}
      </div>
      {picking && (
        <div className="panel p-4 absolute right-0 top-full mt-2 z-20 w-[320px] shadow-card">
          <label className="label" htmlFor="when">Start on</label>
          <input id="when" type="datetime-local" className="input" min={toLocalInput(new Date())} value={when} onChange={(e) => setWhen(e.target.value)} />
          <p className="text-xs text-muted mt-1">Uses your computer&rsquo;s time zone.{picked && !isNaN(picked.getTime()) && <> That is <strong>{centralLabel(picked)}</strong>.</>} Sending runs weekdays, 9 AM to 5 PM Central.</p>
          <div className="flex gap-2 mt-3">
            <button className="btn-primary h-9" disabled={busy || !picked || isNaN(picked.getTime())} onClick={() => call({ status: "scheduled", scheduled_at: picked!.toISOString() })}>Confirm</button>
            <button className="btn-secondary h-9" onClick={() => setPicking(false)}>Cancel</button>
          </div>
        </div>)}
      {err && <p className="text-sm text-brick mt-2 text-right">{err}</p>}
    </div>
  );
}
