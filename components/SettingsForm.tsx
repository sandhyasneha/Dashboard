"use client";
import { useState } from "react";

export function SettingsForm({ dailyCap, monthlyCap }: { dailyCap: number; monthlyCap: number }) {
  const [d, setD] = useState(dailyCap); const [m, setM] = useState(monthlyCap); const [msg, setMsg] = useState("");
  async function save() {
    const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ global_daily_cap: d, monthly_cap: m }) });
    setMsg(res.ok ? "Saved" : "Could not save");
  }
  return (
    <section className="panel p-6">
      <h2 className="font-semibold mb-4">Sending limits</h2>
      <label className="label" htmlFor="d">Emails per day, all campaigns combined</label>
      <input id="d" type="number" className="input mb-4" value={d} onChange={(e) => setD(+e.target.value)} />
      <label className="label" htmlFor="m">Emails per month</label>
      <input id="m" type="number" className="input mb-1" value={m} onChange={(e) => setM(+e.target.value)} />
      <p className="text-xs text-muted mb-5">Match this to your Resend plan. Sending stops when it's reached and resumes on the 1st.</p>
      <div className="flex items-center gap-3"><button className="btn-primary" onClick={save}>Save changes</button><span className="text-sm text-muted">{msg}</span></div>
    </section>
  );
}
