"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Step = { subject: string; body_md: string; delay_days: number };

const starter: Step[] = [
  { subject: "{{company}} — Form 2290 for the 2026-27 tax period", delay_days: 0,
    body_md: "Hi there,\n\nYour carrier ({{company}}, {{state}}) is listed in the FMCSA registry with {{power_units}} power units, which usually means Form 2290 (Heavy Vehicle Use Tax) applies to your trucks.\n\nThe filing deadline for this tax period was August 31. If it's still open, penalties and interest are adding up each month — and you'll need the stamped Schedule 1 to renew registration.\n\nTruckTaxPro files it in about 10 minutes and returns your stamped Schedule 1 the same day: [File Form 2290 now](https://trucktaxpro.com)\n\nReply here if you have questions — a real person answers." },
  { subject: "Re: {{company}} — Form 2290", delay_days: 4,
    body_md: "Quick follow-up in case the last note got buried.\n\nIf you already filed elsewhere, ignore this — you're all set.\n\nIf not, the fastest path is here: [File Form 2290](https://trucktaxpro.com). It takes your VIN, gross weight, and first-use month, and the IRS-stamped Schedule 1 comes back the same day." },
  { subject: "Last note about your 2290", delay_days: 7,
    body_md: "Last message from me on this.\n\nCarriers who file late owe a penalty of about 4.5% of the tax per month plus interest, and DMVs won't renew plates without the stamped Schedule 1.\n\nIf you'd like it handled: [File Form 2290 with TruckTaxPro](https://trucktaxpro.com)\n\nEither way, safe travels out there." },
];

export function CampaignBuilder({ byState, byType }: { byState: Record<string, number>; byType: Record<string, number> }) {
  const router = useRouter();
  const [name, setName] = useState("2290 late filers — " + new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" }));
  const [states, setStates] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [minU, setMinU] = useState(2); const [maxU, setMaxU] = useState(200);
  const [cap, setCap] = useState(700);
  const [steps, setSteps] = useState<Step[]>(starter);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  const estimate = useMemo(() => {
    // Rough: state filter applies, type filter applies; unit range not known client-side.
    const s = states.length ? states.reduce((a, k) => a + (byState[k] ?? 0), 0) : Object.values(byState).reduce((a, b) => a + b, 0);
    const total = Object.values(byState).reduce((a, b) => a + b, 0) || 1;
    const t = types.length ? types.reduce((a, k) => a + (byType[k] ?? 0), 0) / total : 1;
    return Math.round(s * t);
  }, [states, types, byState, byType]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  async function create() {
    setBusy(true); setErr("");
    const res = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, filter_states: states, filter_carrier_types: types, filter_min_units: minU, filter_max_units: maxU, daily_cap: cap, steps }) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Could not create the campaign"); setBusy(false); return; }
    router.push(`/campaigns/${j.id}`);
  }

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6 items-start">
      <div className="space-y-6">
        <section className="panel p-6">
          <label className="label" htmlFor="name">Campaign name</label>
          <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold mb-4">Who gets it</h2>
          <div className="mb-4">
            <div className="label">States <span className="text-muted font-normal">(none selected = all)</span></div>
            <div className="flex flex-wrap gap-2">{Object.entries(byState).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
              <button key={s} type="button" onClick={() => toggle(states, setStates, s)} className={`pill h-8 px-3 border ${states.includes(s) ? "bg-signSoft text-sign border-sign" : "bg-white border-line text-ink"}`}>{s} <span className="ml-1.5 text-muted font-normal">{c.toLocaleString()}</span></button>))}</div>
          </div>
          <div className="mb-4">
            <div className="label">Carrier type <span className="text-muted font-normal">(none selected = all)</span></div>
            <div className="flex flex-wrap gap-2">{Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <button key={t} type="button" onClick={() => toggle(types, setTypes, t)} className={`pill h-8 px-3 border ${types.includes(t) ? "bg-signSoft text-sign border-sign" : "bg-white border-line text-ink"}`}>{t} <span className="ml-1.5 text-muted font-normal">{c.toLocaleString()}</span></button>))}</div>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-sm">
            <div><label className="label" htmlFor="minu">Power units from</label><input id="minu" type="number" className="input" value={minU} min={1} onChange={(e) => setMinU(+e.target.value)} /></div>
            <div><label className="label" htmlFor="maxu">to</label><input id="maxu" type="number" className="input" value={maxU} onChange={(e) => setMaxU(+e.target.value)} /></div>
          </div>
        </section>

        <section className="panel p-6">
          <div className="flex items-center justify-between mb-1"><h2 className="font-semibold">Sequence</h2>
            <button type="button" className="btn-secondary h-8" onClick={() => setSteps([...steps, { subject: "", body_md: "", delay_days: 5 }])}>Add a follow-up</button></div>
          <p className="text-sm text-muted mb-5">Use <code>{"{{company}}"}</code>, <code>{"{{state}}"}</code>, <code>{"{{power_units}}"}</code>, <code>{"{{fleet_type}}"}</code>. Blank line starts a new paragraph; **bold** and [links](https://…) work. Unsubscribe footer is added automatically.</p>
          <div className="space-y-5">{steps.map((s, i) => (
            <div key={i} className="border border-line rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">{i === 0 ? "First email" : `Follow-up ${i}`}</div>
                <div className="flex items-center gap-3 text-sm">
                  {i > 0 && <label className="flex items-center gap-2">Send <input type="number" min={1} className="input w-16 h-8" value={s.delay_days} onChange={(e) => update(i, { delay_days: +e.target.value })} /> days after the previous</label>}
                  {steps.length > 1 && <button type="button" className="text-brick hover:underline" onClick={() => setSteps(steps.filter((_, k) => k !== i))}>Remove</button>}
                </div>
              </div>
              <input className="input mb-2" placeholder="Subject" value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
              <textarea className="textarea" rows={7} placeholder="Body" value={s.body_md} onChange={(e) => update(i, { body_md: e.target.value })} />
            </div>))}</div>
        </section>
      </div>

      <aside className="panel p-5 sticky top-6">
        <h2 className="font-semibold mb-4">Pace</h2>
        <label className="label" htmlFor="cap">Emails per day for this campaign</label>
        <input id="cap" type="number" className="input mb-1" value={cap} onChange={(e) => setCap(+e.target.value)} />
        <p className="text-xs text-muted mb-5">Spread across 9am–5pm Central, weekdays. The monthly limit in Settings still applies on top.</p>
        <dl className="text-sm space-y-2 mb-5">
          <div className="flex justify-between"><dt className="text-muted">Leads to enroll (approx.)</dt><dd className="font-semibold">{estimate.toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Emails in sequence</dt><dd>{steps.length}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Total sends</dt><dd>{(estimate * steps.length).toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Weeks to finish</dt><dd>{cap ? Math.ceil((estimate * steps.length) / cap / 5) : "—"}</dd></div>
        </dl>
        <button className="btn-primary w-full justify-center" onClick={create} disabled={busy || !name || steps.some((s) => !s.subject || !s.body_md)}>{busy ? "Creating…" : "Create campaign"}</button>
        <p className="text-xs text-muted mt-2">Created as a draft. Start it from the campaign page.</p>
        {err && <p className="text-sm text-brick mt-3">{err}</p>}
      </aside>
    </div>
  );
}
