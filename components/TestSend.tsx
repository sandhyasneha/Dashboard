"use client";
import { useState } from "react";

export function TestSend({ campaignId, steps }: { campaignId: string; steps: number }) {
  const [to, setTo] = useState(""); const [which, setWhich] = useState("1"); const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/campaigns/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ campaign_id: campaignId, position: which === "all" ? "all" : +which, to }) });
      const j = await res.json();
      setMsg(res.ok ? { ok: true, text: `Sent ${j.sent} test email${j.sent === 1 ? "" : "s"}. They should arrive within a minute. Check spam too.` } : { ok: false, text: j.error ?? "Could not send the test." });
    } catch { setMsg({ ok: false, text: "Could not reach the server." }); }
    setBusy(false);
  }

  return (
    <div className="mt-6 pt-5 border-t border-line">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="t-step">Send a test of</label>
          <select id="t-step" className="input w-52" value={which} onChange={(e) => setWhich(e.target.value)}>
            {Array.from({ length: steps }, (_, i) => <option key={i} value={String(i + 1)}>{i === 0 ? "First email" : `Follow-up ${i}`}</option>)}
            {steps > 1 && <option value="all">All {steps} emails</option>}
          </select>
        </div>
        <div className="flex-1 min-w-[260px]">
          <label className="label" htmlFor="t-to">to these addresses</label>
          <input id="t-to" type="text" className="input" placeholder="you@example.com, other@example.com" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button className="btn-secondary" disabled={busy || !to.trim()} onClick={send}>{busy ? "Sending…" : "Send test"}</button>
      </div>
      {msg && <p className={`text-sm mt-3 ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</p>}
      <p className="text-xs text-muted mt-3">Up to 5 addresses, separated by commas. Works any day and hour, goes out straight away, enrolls nobody and isn&rsquo;t counted in the campaign numbers or the daily limit. Clicking Unsubscribe in a test email adds that address to the suppression list.</p>
    </div>
  );
}
