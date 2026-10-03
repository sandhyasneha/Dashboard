"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { centralLabel, nextOpening } from "@/lib/schedule";
import { TEMPLATES } from "@/lib/templates";
import { fill, renderEmail } from "@/lib/emailHtml";
import { previewOpts } from "@/lib/brand";

type Step = { subject: string; body_md: string; delay_days: number; notes?: string };
type Mode = "now" | "schedule" | "draft";

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const monthYear = () => new Date().toLocaleDateString("en-US", { month: "short", year: "numeric" });
const sample = { company: "Sample Trucking LLC", state: "TX", power_units: 3, fleet_type: "Sample fleet", phone: null, email: "you@example.com" };

export function CampaignBuilder({ byType, total }: { byType: Record<string, number>; total: number }) {
  const router = useRouter();
  const first = TEMPLATES[0];
  const [name, setName] = useState(`${first.name} — ${monthYear()}`); const [nameEdited, setNameEdited] = useState(false);
  const [types, setTypes] = useState<string[]>([]);
  const [limit, setLimit] = useState("");                    // blank = everyone who matches
  const [cap, setCap] = useState(50);
  const [steps, setSteps] = useState<Step[]>(first.steps);
  const [mode, setMode] = useState<Mode>("now");
  const [sched, setSched] = useState("");
  const [now, setNow] = useState<Date | null>(null); const [origin, setOrigin] = useState("");
  const [testTo, setTestTo] = useState(""); const [testBusy, setTestBusy] = useState<number | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<number | null>(null); const [aiMsg, setAiMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");

  useEffect(() => { setNow(new Date()); setOrigin(window.location.origin); }, []); // after mount, so server and browser render the same HTML

  const matching = useMemo(() => (types.length ? types.reduce((x, k) => x + (byType[k] ?? 0), 0) : total), [types, byType, total]);
  const estimate = limit && +limit > 0 ? Math.min(matching, +limit) : matching;

  const schedDate = sched ? new Date(sched) : null;
  const startAt = mode === "schedule" ? schedDate : mode === "now" ? now : null;
  const firstOut = startAt && !isNaN(startAt.getTime()) ? nextOpening(startAt) : null;
  const weeks = cap ? Math.ceil((estimate * steps.length) / cap / 5) : 0;

  const toggle = (v: string) => setTypes(types.includes(v) ? types.filter((x) => x !== v) : [...types, v]);
  const update = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  function applyTemplate(id: string) {
    const t = TEMPLATES.find((x) => x.id === id); if (!t) return;
    if (steps.some((s) => s.body_md.trim()) && !confirm("Replace the emails below with this template?")) return;
    setSteps(t.steps.map((s) => ({ ...s }))); setPreview(null); setAiMsg(null);
    if (!nameEdited) setName(`${t.name} — ${monthYear()}`);
  }

  async function writeWithAI(i: number) {
    if (steps[i].body_md.trim() && !confirm("Replace the current text of this email with a new AI draft?")) return;
    setAiBusy(i); setAiMsg(null);
    try {
      const res = await fetch("/api/ai/email", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: steps[i].subject, notes: steps[i].notes ?? "", position: i, previous: i > 0 ? steps[0].body_md : "" }) });
      const j = await res.json();
      if (!res.ok) setAiMsg({ ok: false, text: j.error ?? "The AI could not write this email." });
      else { update(i, { body_md: j.body }); setAiMsg({ ok: true, text: "Draft written. Read it, change anything you like, then send yourself a test." }); }
    } catch { setAiMsg({ ok: false, text: "Could not reach the server." }); }
    setAiBusy(null);
  }

  async function sendTest(which: number | "all") {
    setTestBusy(which === "all" ? -1 : which); setTestMsg(null);
    const what = which === "all" ? { steps: steps.map((x) => ({ subject: x.subject, body_md: x.body_md })) } : { subject: steps[which].subject, body_md: steps[which].body_md };
    try {
      const res = await fetch("/api/campaigns/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: testTo, ...what }) });
      const j = await res.json();
      setTestMsg(res.ok ? { ok: true, text: `Sent ${j.sent} test email${j.sent === 1 ? "" : "s"}. Check your inbox and spam folder.${j.warning ? " " + j.warning : ""}` } : { ok: false, text: j.error ?? "Could not send the test." });
    } catch { setTestMsg({ ok: false, text: "Could not reach the server." }); }
    setTestBusy(null);
  }

  async function create() {
    if (mode !== "draft") {
      const what = mode === "now" ? "start sending right away" : `schedule it for ${centralLabel(schedDate!)}`;
      const ok = confirm(`${estimate.toLocaleString()} contacts · ${steps.length} email${steps.length > 1 ? "s" : ""} · up to ${cap} a day\n\nThis enrolls the contacts and will ${what}.${firstOut ? `\nFirst emails go out: ${centralLabel(firstOut)}.` : ""}\n\nContinue?`);
      if (!ok) return;
    }
    setBusy(true); setErr("");
    const res = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, filter_carrier_types: types, max_contacts: limit === "" ? null : +limit, daily_cap: cap,
        steps: steps.map((s) => ({ subject: s.subject, body_md: s.body_md, delay_days: s.delay_days })), mode, scheduled_at: schedDate ? schedDate.toISOString() : null }) });
    const j = await res.json();
    if (!res.ok) { setErr(j.error ?? "Could not create the campaign"); setBusy(false); return; }
    router.push(`/campaigns/${j.id}`);
  }

  const blocked = busy || !name || steps.some((s) => !s.subject || !s.body_md) || (mode === "schedule" && (!schedDate || isNaN(schedDate.getTime()))) || estimate === 0;
  const button = mode === "now" ? "Start sending" : mode === "schedule" ? "Schedule campaign" : "Save draft";
  const previewHtml = (i: number) => renderEmail(fill(steps[i].body_md, sample), "#", previewOpts(origin));

  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-6">
        <section className="panel p-6">
          <label className="label" htmlFor="name">Campaign name</label>
          <input id="name" className="input" value={name} onChange={(e) => { setName(e.target.value); setNameEdited(true); }} />
        </section>

        <section className="panel p-6">
          <h2 className="font-semibold mb-4">1. Who gets it</h2>
          <div className="label">Lists <span className="text-muted font-normal">(none selected = everyone)</span></div>
          <div className="flex flex-wrap gap-2 mb-4">{Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
            <button key={t} type="button" onClick={() => toggle(t)} className={`pill h-8 px-3 border ${types.includes(t) ? "bg-signSoft text-sign border-sign" : "bg-white border-line text-ink"}`}>{t} <span className="ml-1.5 text-muted font-normal">{c.toLocaleString()}</span></button>))}</div>
          <div className="max-w-xs"><label className="label" htmlFor="lim">Only the first</label><input id="lim" type="number" min={1} className="input" placeholder="all" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          <p className="text-xs text-muted mt-2">Contacts who are not customers yet and are not already in another campaign. &ldquo;Only the first&rdquo; lets you roll out in batches while the sending domain warms up.</p>
        </section>

        <section className="panel p-6">
          <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">2. What you send</h2>
            <button type="button" className="btn-secondary h-8" onClick={() => setSteps([...steps, { subject: "", body_md: "", delay_days: 5 }])}>Add a follow-up</button></div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <label className="text-sm font-medium" htmlFor="tpl">Start from a template</label>
            <select id="tpl" className="input w-72 h-9" value="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">Choose a template…</option>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <p className="text-sm text-muted mb-4">Edit anything, or type a title and press <strong>Write with AI</strong>. A blank line starts a new paragraph. A line with only a link becomes an orange button. **bold** works. The logo and footer are added to every email automatically. Check dates and claims before you send.</p>
          <div className="mb-5 p-3 bg-slate rounded-md">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-medium" htmlFor="testto">Test addresses</label>
              <input id="testto" type="text" className="input w-80 h-9" placeholder="you@example.com, other@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
              <button type="button" className="btn-secondary h-9" disabled={!testTo.trim() || steps.some((x) => !x.subject || !x.body_md) || testBusy !== null} onClick={() => sendTest("all")}>{testBusy === -1 ? "Sending…" : `Send all ${steps.length} test email${steps.length > 1 ? "s" : ""}`}</button>
            </div>
            <p className="text-xs text-muted mt-2">Up to 5 addresses, separated by commas. Works any day and hour.</p>
          </div>
          {testMsg && <p className={`text-sm mb-3 ${testMsg.ok ? "text-sign" : "text-brick"}`}>{testMsg.text}</p>}
          {aiMsg && <p className={`text-sm mb-3 ${aiMsg.ok ? "text-sign" : "text-brick"}`}>{aiMsg.text}</p>}
          <div className="space-y-5">{steps.map((s, i) => (
            <div key={i} className="border border-line rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">{i === 0 ? "First email" : `Follow-up ${i}`}</div>
                <div className="flex items-center gap-3 text-sm">
                  {i > 0 && <label className="flex items-center gap-2">Send <input type="number" min={1} className="input w-16 h-8" value={s.delay_days} onChange={(e) => update(i, { delay_days: +e.target.value })} /> days after the previous</label>}
                  <button type="button" className="btn-secondary h-8" disabled={!testTo.trim() || !s.subject || !s.body_md || testBusy !== null} onClick={() => sendTest(i)}>{testBusy === i ? "Sending…" : "Send test"}</button>
                  {steps.length > 1 && <button type="button" className="text-brick hover:underline" onClick={() => { setSteps(steps.filter((_, k) => k !== i)); setPreview(null); }}>Remove</button>}
                </div>
              </div>
              <input className="input mb-2" placeholder="Title (this is the subject line)" value={s.subject} onChange={(e) => update(i, { subject: e.target.value })} />
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <button type="button" className="btn-secondary h-9" disabled={aiBusy !== null || s.subject.trim().length < 3} onClick={() => writeWithAI(i)}>{aiBusy === i ? "Writing…" : "✨ Write with AI"}</button>
                <input className="input h-9 flex-1 min-w-[240px]" placeholder="Details for the AI (optional), for example a deadline or an offer" value={s.notes ?? ""} onChange={(e) => update(i, { notes: e.target.value })} />
              </div>
              <textarea className="textarea" rows={9} placeholder="Body" value={s.body_md} onChange={(e) => update(i, { body_md: e.target.value })} />
              <button type="button" className="text-sm text-sign font-medium mt-2 hover:underline" disabled={!s.body_md.trim()} onClick={() => setPreview(preview === i ? null : i)}>{preview === i ? "Hide preview" : "Preview this email"}</button>
              {preview === i && <iframe title="Email preview" sandbox="" className="w-full h-[640px] border border-line rounded-md mt-3 bg-white" srcDoc={previewHtml(i)} />}
            </div>))}</div>
        </section>
      </div>

      <aside className="panel p-5 sticky top-6">
        <h2 className="font-semibold mb-4">3. When to send</h2>
        <div className="space-y-2.5 mb-4">
          {([["now", "Send now"], ["schedule", "Schedule for later"], ["draft", "Save as draft"]] as [Mode, string][]).map(([m, label]) => (
            <label key={m} className="flex items-center gap-2 text-sm cursor-pointer"><input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} /> {label}</label>))}
        </div>
        {mode === "schedule" && (
          <div className="mb-4">
            <label className="label" htmlFor="sched">Start on</label>
            <input id="sched" type="datetime-local" className="input" min={now ? toLocalInput(now) : undefined} value={sched} onChange={(e) => setSched(e.target.value)} />
            <p className="text-xs text-muted mt-1">Uses your computer&rsquo;s time zone.{schedDate && !isNaN(schedDate.getTime()) && <> That is <strong>{centralLabel(schedDate)}</strong>.</>}</p>
          </div>)}
        {firstOut && <p className="text-sm bg-signSoft text-ink rounded-md p-3 mb-4">First emails go out <strong>{centralLabel(firstOut)}</strong>. Sending runs weekdays, 9 AM to 5 PM Central.</p>}

        <label className="label" htmlFor="cap">Emails per day</label>
        <input id="cap" type="number" min={1} className="input mb-1" value={cap} onChange={(e) => setCap(+e.target.value)} />
        <p className="text-xs text-muted mb-5">Start low on a new sending domain and raise it each week. The overall daily limit (700, or 1,000 in May to July) always applies on top.</p>
        <dl className="text-sm space-y-2 mb-5">
          <div className="flex justify-between"><dt className="text-muted">Contacts (approx.)</dt><dd className="font-semibold">{estimate.toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Emails in sequence</dt><dd>{steps.length}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Total sends</dt><dd>{(estimate * steps.length).toLocaleString()}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Weeks to finish</dt><dd>{weeks || "—"}</dd></div>
        </dl>
        <button className="btn-primary w-full justify-center" onClick={create} disabled={blocked}>{busy ? "Working…" : button}</button>
        {estimate === 0 && <p className="text-xs text-brick mt-2">No contacts match these choices.</p>}
        {err && <p className="text-sm text-brick mt-3">{err}</p>}
      </aside>
    </div>
  );
}
