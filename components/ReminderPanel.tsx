"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = { subject: string; body_md: string; delay_days: number };
type Group = "registered" | "unpaid";
type Cfg = { enabled: boolean; daily_cap: number; steps: Record<Group, Step[]> };
type Camp = { id: string; name: string; status: string } | null;
const TITLES: Record<Group, { title: string; who: string }> = {
  registered: { title: "Registered, no return started", who: "Signed up 1 to 60 days ago and has not started a return. Leaves as soon as they start one." },
  unpaid: { title: "Started a return, not paid", who: "Has a draft return this tax year, started 1 to 60 days ago, and nothing paid. Leaves as soon as they pay." },
};
const STATUS_WORDS: Record<string, string> = { draft: "Draft: open it, send yourself a test, then press Start now", running: "Running", paused: "Paused", scheduled: "Scheduled" };

export function ReminderPanel({ initial, campaigns, waiting, lastResult, hold, missing }: {
  initial: Cfg; campaigns: Record<Group, Camp>; waiting: Record<Group, number>; lastResult: string | null; hold: boolean; missing?: boolean;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<Cfg>(initial); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Group | null>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const updStep = (g: Group, i: number, patch: Partial<Step>) => setCfg({ ...cfg, steps: { ...cfg.steps, [g]: cfg.steps[g].map((s, k) => (k === i ? { ...s, ...patch } : s)) } });

  async function save(run: boolean) {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/reminders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...cfg, run }) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok || j.ok === false) { setMsg({ ok: false, text: j.error ?? j.message ?? "Could not save." }); return; }
    setMsg({ ok: true, text: j.message ?? "Saved." }); router.refresh();
  }

  return (
    <section id="reminders" className="panel p-5 mb-6">
      <h2 className="font-semibold mb-1">Automatic reminders</h2>
      <p className="text-sm text-muted mb-4">Every day after the morning sync, people who registered but never started a return, and people who started one but never paid, are added to two reminder campaigns. Each person gets at most two emails, and leaves as soon as they act. Unsubscribed and bounced addresses are skipped.</p>
      {missing && <p className="text-sm bg-amberSoft rounded-md p-3 mb-4">Run <code>supabase/patch-013.sql</code> in Supabase before using this.</p>}
      {hold && <p className="text-sm bg-amberSoft rounded-md p-3 mb-4"><strong>Sending is on hold</strong> (Settings). People are still added, but no reminder is emailed until the hold is released.</p>}

      <div className="grid grid-cols-2 gap-5 mb-5">
        <div>
          <div className="label">Status</div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cfg.enabled} onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })} /> Add new people every day</label>
          <p className="text-xs text-muted mt-1">A new reminder campaign starts as a draft. It sends only after you press Start now on it, and only while sending is not on hold.</p>
        </div>
        <div>
          <div className="label" id="rcap">Emails per day, per reminder</div>
          <input aria-labelledby="rcap" type="number" min={1} className="input h-9 !w-32" value={cfg.daily_cap} onChange={(e) => setCfg({ ...cfg, daily_cap: +e.target.value })} />
        </div>
      </div>

      <div className="space-y-3 mb-5">{(["registered", "unpaid"] as Group[]).map((g) => {
        const c = campaigns[g];
        return (
          <div key={g} className="border border-line rounded-lg">
            <div className="p-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{TITLES[g].title}</div>
                <div className="text-sm text-muted">{TITLES[g].who}</div>
                <div className="text-sm mt-1">{c ? <><Link href={`/campaigns/${c.id}`} className="text-sign font-medium hover:underline">{c.name}</Link> <span className="text-muted">· {STATUS_WORDS[c.status] ?? c.status} · {waiting[g]} waiting</span></> : <span className="text-muted">Not created yet. It appears as a draft after the first run.</span>}</div>
              </div>
              <button className="btn-secondary h-9" onClick={() => setOpen(open === g ? null : g)}>{open === g ? "Hide the emails" : "Edit the emails"}</button>
            </div>
            {open === g && <div className="px-4 pb-4 space-y-4">{cfg.steps[g].map((s, i) => (
              <div key={i} className="border border-line rounded-lg p-4">
                <div className="flex items-center justify-between mb-2"><div className="font-semibold text-sm">{i === 0 ? "First reminder (the day after they qualify)" : "Second reminder"}</div>
                  {i > 0 && <label className="text-sm flex items-center gap-2">Send <input type="number" min={1} max={30} className="input !w-16 h-8" value={s.delay_days} onChange={(e) => updStep(g, i, { delay_days: +e.target.value })} /> days after the first</label>}</div>
                <input className="input mb-2" placeholder="Title (the subject line)" value={s.subject} onChange={(e) => updStep(g, i, { subject: e.target.value })} />
                <textarea className="textarea" rows={7} value={s.body_md} onChange={(e) => updStep(g, i, { body_md: e.target.value })} />
              </div>))}
              <p className="text-xs text-muted"><code>{"{{tax_year}}"}</code> becomes the current tax year, for example 2026-27. A line with only a link becomes an orange button. Saving updates the emails for everyone still waiting.</p>
            </div>}
          </div>);
      })}</div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy} onClick={() => save(false)}>{busy ? "Saving…" : "Save settings"}</button>
        <button className="btn-secondary" disabled={busy} onClick={() => save(true)}>Save and add today&rsquo;s people now</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</span>}
      </div>
      {lastResult && <p className="text-xs text-muted mt-3">Last run: {lastResult}</p>}
    </section>
  );
}
