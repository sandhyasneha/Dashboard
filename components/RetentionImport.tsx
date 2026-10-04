"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";

const pad = (n: number) => String(n).padStart(2, "0");
/** Turns a spreadsheet cell into yyyy-mm-dd. Accepts real dates, 2027-04, 2027-04-15, "April 2027", 4/15/2027. */
function toIso(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? "").trim(); if (!s) return null;
  const ym = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/); if (ym) return `${ym[1]}-${pad(+ym[2])}-${pad(+(ym[3] ?? 1))}`;
  const t = new Date(s); if (!isNaN(t.getTime())) return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(/\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}/.test(s) ? t.getDate() : 1)}`;
  return null;
}
const EMAIL_KEYS = ["email", "contact email", "email_address", "email address"];
const DATE_KEYS = ["filed on", "filed", "filed date", "filing date", "date", "filed month", "month"];

export function RetentionImport() {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [rows, setRows] = useState<{ email: string; filed_on: string }[] | null>(null);
  const [skipped, setSkipped] = useState(0); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);

  async function load(f: File) {
    setMsg(null); setFile(f);
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const pick = (r: Record<string, any>, keys: string[]) => { const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase())); return k ? r[k] : undefined; };
    const good: { email: string; filed_on: string }[] = []; let bad = 0;
    for (const r of data) { const email = String(pick(r, EMAIL_KEYS) ?? "").trim(); const d = toIso(pick(r, DATE_KEYS)); if (email && d) good.push({ email, filed_on: d }); else bad++; }
    setRows(good); setSkipped(bad);
  }
  async function run() {
    if (!rows || !file) return; setBusy(true); setMsg(null); let saved = 0, invalid = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await fetch("/api/retention/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: rows.slice(i, i + 500), source: file.name }) });
      const j = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Import failed" }); setBusy(false); return; }
      saved += j.saved; invalid += j.invalid;
    }
    setBusy(false); setMsg({ ok: true, text: `Saved ${saved.toLocaleString()} past filings${invalid + skipped ? `; skipped ${(invalid + skipped).toLocaleString()} rows without a valid email or date` : ""}.` });
    setRows(null); setFile(null); router.refresh();
  }
  return (
    <section className="panel p-5 mb-6">
      <h2 className="font-semibold mb-1">Import past filers</h2>
      <p className="text-sm text-muted mb-4">For customers who filed with you but are not in the system. Use a file with an <strong>Email</strong> column and a <strong>Filed On</strong> column (a date, or just a month such as 2027-04). They join the matching month's group, and show as Imported.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => input.current?.click()}>Choose file</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        {file && rows && <span className="text-sm">{file.name}: <strong>{rows.length.toLocaleString()}</strong> rows ready{skipped ? `, ${skipped} skipped (no valid email or date)` : ""}</span>}
        {rows && rows.length > 0 && <button className="btn-primary" disabled={busy} onClick={run}>{busy ? "Importing…" : "Import these filings"}</button>}
      </div>
      {msg && <p className={`text-sm mt-3 ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</p>}
    </section>
  );
}
