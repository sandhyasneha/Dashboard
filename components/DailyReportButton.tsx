"use client";
import { useState } from "react";

export function DailyReportButton() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/daily-report", { method: "POST" }); const j = await res.json().catch(() => ({})); setBusy(false);
    setMsg(res.ok ? { ok: true, text: j.message } : { ok: false, text: j.error ?? "Could not send" });
  }
  return (
    <div className="flex flex-wrap items-center gap-3 mt-3">
      <button className="btn-secondary" disabled={busy} onClick={go}>{busy ? "Sending…" : "Send today's report now"}</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</span>}
    </div>
  );
}
