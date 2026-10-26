"use client";
import { useState } from "react";

export function SyncAlertTest() {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/sync-alert", { method: "POST" }); const j = await res.json(); setBusy(false);
    setMsg(res.ok ? { ok: true, text: j.message } : { ok: false, text: j.error ?? "Could not send" });
  }
  return (
    <div className="flex flex-wrap items-center gap-3 mt-4">
      <button className="btn-secondary" disabled={busy} onClick={go}>{busy ? "Sending…" : "Send a test alert"}</button>
      {msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</span>}
    </div>
  );
}
