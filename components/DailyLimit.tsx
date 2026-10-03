"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function DailyLimit({ id, value }: { id: string; value: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(value)); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/campaigns", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, daily_cap: +v }) });
    setMsg(res.ok ? { ok: true, text: "Saved. It applies from the next 15-minute run." } : { ok: false, text: (await res.json()).error ?? "Could not save." });
    router.refresh(); setBusy(false);
  }
  return (
    <div className="panel p-4 mb-6 flex flex-wrap items-end gap-3">
      <div><label className="label" htmlFor="dl">Emails per day</label><input id="dl" type="number" min={1} max={5000} className="input w-32" value={v} onChange={(e) => setV(e.target.value)} /></div>
      <button className="btn-secondary" disabled={busy || !v || +v === value} onClick={save}>Save limit</button>
      <p className="text-sm text-muted flex-1 min-w-[260px]">Raise this a little each week while the sending domain warms up. See KB, Warm up the sending domain.</p>
      {msg && <p className={`text-sm w-full ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</p>}
    </div>
  );
}
