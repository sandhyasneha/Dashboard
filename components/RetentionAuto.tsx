"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = { subject: string; body_md: string; delay_days: number };
type Cfg = { enabled: boolean; mode: "review" | "auto"; send_day: number; daily_cap: number; steps: Step[]; last_result: string | null };

const AI_NOTES = "This is a renewal reminder to a customer who filed with TruckTaxPro in {{last_filed}}. Keep the placeholders {{last_filed}} and {{tax_year}} exactly as written.";

export function RetentionAuto({ initial, missing }: { initial: Cfg; missing?: boolean }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<Cfg>(initial); const [busy, setBusy] = useState(false); const [aiBusy, setAiBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const upd = (patch: Partial<Cfg>) => setCfg({ ...cfg, ...patch });
  const updStep = (i: number, patch: Partial<Step>) => upd({ steps: cfg.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  async function save(run: boolean) {
    if (run && !confirm("Create this month's renewal campaign now? It uses the group of customers who filed in this same month last year.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/retention/auto", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cfg, run }) });
    const j = await res.json(); setBusy(false);
    if (!res.ok || j.ok === false) { setMsg({ ok: false, text: j.error ?? j.message ?? "Could not save." }); return; }
    setMsg({ ok: true, text: run ? (j.message ?? j.skipped ?? "Done.") : "Saved." }); router.refresh();
  }
  async function ai(i: number) {
    if (cfg.steps[i].body_md.trim() && !confirm("Replace the current text of this email with a new AI draft?")) return;
    setAiBusy(i); setMsg(null);
    const res = await fetch("/api/ai/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: cfg.steps[i].subject, notes: AI_NOTES, position: i, previous: i > 0 ? cfg.steps[0].body_md : "" }) });
    const j = await res.json(); setAiBusy(null);
    if (!res.ok) setMsg({ ok: false, text: j.error ?? "The AI could not write this email." }); else updStep(i, { body_md: j.body });
  }
  return (
    <section className="panel p-5 mb-6">
      <h2 className="font-semibold mb-1">Monthly renewals</h2>
      <p className="text-sm text-muted mb-4">Once a month, the customers who filed in <strong>this same month last year</strong> and have not filed in the current tax year are put into a renewal campaign. Separate from your general campaigns.</p>
      {missing && <p className="text-sm bg-amberSoft rounded-md p-3 mb-4">Run <code>supabase/patch-008.sql</code> in Supabase before using this.</p>}
      <div className="grid grid-cols-3 gap-5 mb-5">
        <div>
          <div className="label">Status</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => upd({ enabled: e.target.checked })} /> Create it every month</label>
        </div>
        <div>
          <div className="label">When it is created</div>
          <label className="text-sm">On day <select className="input !w-20 h-9 inline-block mx-1" value={cfg.send_day} onChange={(e) => upd({ send_day: +e.target.value })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select> of the month</label>
        </div>
        <div>
          <div className="label" id="cap-l">Emails per day</div>
          <input aria-labelledby="cap-l" type="number" min={1} className="input h-9" value={cfg.daily_cap} onChange={(e) => upd({ daily_cap: +e.target.value })} />
        </div>
      </div>
      <div className="mb-5">
        <div className="label">What happens</div>
        <label className="flex items-start gap-2 text-sm mb-1.5"><input className="mt-1" type="radio" name="mode" checked={cfg.mode === "review"} onChange={() => upd({ mode: "review" })} /> <span><strong>Review first</strong> (recommended). It creates a draft and shows it here under Ready to review. You read it and press Start now.</span></label>
        <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="radio" name="mode" checked={cfg.mode === "auto"} onChange={() => upd({ mode: "auto" })} /> <span><strong>Send automatically.</strong> It starts sending by itself, within the usual weekday sending hours and daily limits.</span></label>
      </div>
      <div className="space-y-4 mb-4">{cfg.steps.map((s, i) => (
        <div key={i} className="border border-line rounded-lg p-4">
          <div className="flex items-center justify-between mb-2"><div className="font-semibold">{i === 0 ? "First email" : `Follow-up ${i}`}</div>
            {i > 0 && <label className="text-sm flex items-center gap-2">Send <input type="number" min={1} className="input !w-16 h-8" value={s.delay_days} onChange={(e) => updStep(i, { delay_days: +e.target.value })} /> days after the previous</label>}</div>
          <input className="input mb-2" placeholder="Title (the subject line)" value={s.subject} onChange={(e) => updStep(i, { subject: e.target.value })} />
          <button type="button" className="btn-secondary h-9 mb-2" disabled={aiBusy !== null || s.subject.trim().length < 3} onClick={() => ai(i)}>{aiBusy === i ? "Writing…" : "✨ Write with AI"}</button>
          <textarea className="textarea" rows={8} value={s.body_md} onChange={(e) => updStep(i, { body_md: e.target.value })} />
        </div>))}</div>
      <p className="text-xs text-muted mb-4">Placeholders filled in for each month: <code>{"{{last_filed}}"}</code> (for example April 2027), <code>{"{{tax_year}}"}</code> (for example 2027-28) and <code>{"{{month}}"}</code> (April). A line with only a link becomes an orange button.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save settings"}</button>
        <button className="btn-secondary" disabled={busy} onClick={() => save(true)}>Create this month&rsquo;s renewals now</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</span>}
      </div>
      {cfg.last_result && <p className="text-xs text-muted mt-3">Last run: {cfg.last_result}</p>}
    </section>
  );
}
