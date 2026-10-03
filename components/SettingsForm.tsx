"use client";
import { useState } from "react";

export function SettingsForm({ dailyCap, peakCap, monthlyCap }: { dailyCap: number; peakCap: number; monthlyCap: number }) {
  const [d, setD] = useState(dailyCap); const [p, setP] = useState(peakCap); const [m, setM] = useState(monthlyCap);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save() {
    const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ global_daily_cap: d, peak_daily_cap: p, monthly_cap: m }) });
    setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: (await res.json()).error ?? "Could not save" });
  }
  return (
    <section className="panel p-6">
      <h2 className="font-semibold mb-4">Sending limits</h2>
      <label className="label" htmlFor="d">Emails per day, all campaigns combined</label>
      <input id="d" type="number" min={1} className="input mb-1" value={d} onChange={(e) => setD(+e.target.value)} />
      <p className="text-xs text-muted mb-4">The ceiling for every day outside the peak months.</p>
      <label className="label" htmlFor="p">Emails per day in the peak months (May, June, July)</label>
      <input id="p" type="number" min={1} className="input mb-1" value={p} onChange={(e) => setP(+e.target.value)} />
      <p className="text-xs text-muted mb-4">Used instead of the number above during those three months.</p>
      <label className="label" htmlFor="m">Emails per month</label>
      <input id="m" type="number" min={1} className="input mb-1" value={m} onChange={(e) => setM(+e.target.value)} />
      <p className="text-xs text-muted mb-5">Match this to your Resend plan. Sending stops when it is reached and resumes on the 1st. A campaign&rsquo;s own Emails per day can only lower these, never raise them.</p>
      <div className="flex items-center gap-3"><button className="btn-primary" onClick={save}>Save changes</button>{msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</span>}</div>
    </section>
  );
}
