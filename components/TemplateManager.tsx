"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fill, renderEmail } from "@/lib/emailHtml";
import { previewOpts } from "@/lib/brand";
import { INBOX_TIPS, inboxWarnings } from "@/lib/inboxCheck";

type Step = { subject: string; body_md: string; delay_days: number };
export type SavedTemplate = { id: string; name: string; description: string | null; steps: Step[]; updated_at: string; created_by: string | null };
type BuiltIn = { id: string; name: string; description: string; steps: Step[] };
type Draft = { id?: string; name: string; description: string; steps: Step[] };

const sample = { company: "Sample Trucking LLC", state: "TX", power_units: 3, fleet_type: "Sample fleet", phone: null, email: "you@example.com" };
const STARTER: Step[] = [{ subject: "", body_md: "Hi there,\n\n\n\nhttps://trucktaxpro.com\n\nAny questions, just reply to this email.", delay_days: 0 }];

export function InboxTips() {
  return (
    <div className="panel p-4 bg-signSoft text-sm mb-6">
      <div className="font-semibold mb-1">Keep it plain to land in the inbox</div>
      <ul className="list-disc pl-5 space-y-0.5">{INBOX_TIPS.map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

export function TemplateManager({ saved, builtIn, missing }: { saved: SavedTemplate[]; builtIn: BuiltIn[]; missing?: boolean }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [origin, setOrigin] = useState(""); useEffect(() => setOrigin(window.location.origin), []);

  const open = (d: Draft) => { setDraft(JSON.parse(JSON.stringify(d))); setPreview(null); setMsg(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const upd = (i: number, patch: Partial<Step>) => draft && setDraft({ ...draft, steps: draft.steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });

  async function save() {
    if (!draft) return; setBusy(true); setMsg(null);
    const res = await fetch("/api/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
    const j = await res.json().catch(() => ({})); setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Could not save." }); return; }
    setDraft(null); setMsg({ ok: true, text: `Saved "${draft.name}". It now appears in New campaign, under Start from a template.` }); router.refresh();
  }
  async function remove(t: SavedTemplate) {
    if (!confirm(`Delete the template "${t.name}"? Campaigns already made from it are not affected.`)) return;
    const res = await fetch("/api/templates", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: t.id }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) setMsg({ ok: false, text: j.error ?? "Could not delete." }); else { setMsg({ ok: true, text: `Deleted "${t.name}".` }); router.refresh(); }
  }
  const blocked = busy || !draft?.name.trim() || !!draft?.steps.some((s) => !s.subject.trim() || !s.body_md.trim());

  return (
    <>
      {missing && <div className="panel p-4 mb-6 bg-amberSoft text-sm">Run <code>supabase/patch-015.sql</code> in Supabase, then reload, to save your own templates.</div>}
      {msg && <p className={`text-sm mb-4 ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</p>}

      {draft ? (
        <section className="panel p-6 mb-6">
          <h2 className="font-semibold mb-4">{draft.id ? "Edit template" : "New template"}</h2>
          <InboxTips />
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div><label className="label" htmlFor="tn">Template name</label><input id="tn" className="input" placeholder="For example: $6.99 per truck, plain" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div><label className="label" htmlFor="td">What it is for (optional)</label><input id="td" className="input" placeholder="For example: off-season offer to past contacts" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
          </div>
          <div className="space-y-5 mb-5">{draft.steps.map((s, i) => {
            const warnings = inboxWarnings(s.subject, s.body_md);
            return (
              <div key={i} className="border border-line rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-semibold">{i === 0 ? "First email" : `Follow-up ${i}`}</div>
                  <div className="flex items-center gap-3 text-sm">
                    {i > 0 && <label className="flex items-center gap-2">Send <input type="number" min={1} max={60} className="input w-16 h-8" value={s.delay_days} onChange={(e) => upd(i, { delay_days: +e.target.value })} /> days after the previous</label>}
                    {draft.steps.length > 1 && <button type="button" className="text-brick hover:underline" onClick={() => { setDraft({ ...draft, steps: draft.steps.filter((_, k) => k !== i) }); setPreview(null); }}>Remove</button>}
                  </div>
                </div>
                <input className="input mb-2" placeholder="Subject line" value={s.subject} onChange={(e) => upd(i, { subject: e.target.value })} />
                <textarea className="textarea" rows={9} placeholder="Body" value={s.body_md} onChange={(e) => upd(i, { body_md: e.target.value })} />
                {warnings.length > 0 && <ul className="text-xs text-amber mt-2 space-y-0.5">{warnings.map((w) => <li key={w}>Inbox tip: {w}</li>)}</ul>}
                <button type="button" className="text-sm text-sign font-medium mt-2 hover:underline" disabled={!s.body_md.trim()} onClick={() => setPreview(preview === i ? null : i)}>{preview === i ? "Hide preview" : "Preview this email"}</button>
                {preview === i && <iframe title="Email preview" sandbox="" className="w-full h-[560px] border border-line rounded-md mt-3 bg-white" srcDoc={renderEmail(fill(s.body_md, sample), "#", previewOpts(origin))} />}
              </div>);
          })}</div>
          <p className="text-xs text-muted mb-4">A blank line starts a new paragraph. A web address typed as plain text becomes a clickable link. [button text](https://…) alone on a line becomes an orange button (more ad-like). **bold** works. Placeholders: {"{{company}}"} (the company name on the contact list, or &ldquo;your company&rdquo;).</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-secondary" disabled={draft.steps.length >= 10} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { subject: "", body_md: "Hi there,\n\n", delay_days: 4 }] })}>Add a follow-up</button>
            <button className="btn-primary" disabled={blocked} onClick={save}>{busy ? "Saving…" : "Save template"}</button>
            <button className="btn-secondary" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </section>
      ) : (
        <div className="mb-6"><button className="btn-primary" disabled={missing} onClick={() => open({ name: "", description: "", steps: STARTER })}>Create template</button></div>
      )}

      <section className="panel overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-line"><h2 className="font-semibold">Your templates</h2></div>
        {saved.length ? (
          <table className="table"><thead><tr><th>Name</th><th>Emails</th><th>First subject</th><th>Updated</th><th></th></tr></thead>
            <tbody>{saved.map((t) => (
              <tr key={t.id}>
                <td><div className="font-medium">{t.name}</div>{t.description && <div className="text-xs text-muted">{t.description}</div>}</td>
                <td>{t.steps.length}</td>
                <td className="text-muted max-w-xs truncate">{t.steps[0]?.subject}</td>
                <td className="text-muted whitespace-nowrap">{new Date(t.updated_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" })}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="text-sign font-medium hover:underline mr-4" onClick={() => open({ id: t.id, name: t.name, description: t.description ?? "", steps: t.steps })}>Edit</button>
                  <button className="text-brick hover:underline" onClick={() => remove(t)}>Delete</button>
                </td>
              </tr>))}</tbody></table>
        ) : <p className="px-5 py-8 text-sm text-muted">No templates yet. Press Create template, or save the emails from a campaign you are building with Save as template.</p>}
      </section>

      <section className="panel overflow-hidden">
        <div className="px-5 py-4 border-b border-line"><h2 className="font-semibold">Built-in templates</h2><p className="text-sm text-muted mt-1">Fixed starting points. Press Copy to make your own editable version.</p></div>
        <table className="table"><thead><tr><th>Name</th><th>Emails</th><th></th></tr></thead>
          <tbody>{builtIn.map((t) => (
            <tr key={t.id}><td><div className="font-medium">{t.name}</div><div className="text-xs text-muted">{t.description}</div></td><td>{t.steps.length}</td>
              <td className="text-right"><button className="text-sign font-medium hover:underline" disabled={missing} onClick={() => open({ name: `${t.name} (my copy)`, description: t.description, steps: t.steps })}>Copy</button></td></tr>))}</tbody></table>
      </section>
    </>
  );
}
