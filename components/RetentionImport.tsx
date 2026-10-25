"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { TEMPLATE_HEADERS, readImportRow, type ImportRow } from "@/lib/customerFields";

/** Import past filers: customers who filed with you but are not in the system. Used on the Customers and Retention pages. */
export function RetentionImport() {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null); const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [problems, setProblems] = useState<{ count: number; examples: string[] }>({ count: 0, examples: [] });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [busy, setBusy] = useState(false);

  async function load(f: File) {
    setMsg(null); setFile(f);
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: true });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
    const good: ImportRow[] = []; let bad = 0; const examples: string[] = [];
    data.forEach((r, i) => {
      const out = readImportRow(r);
      if ("rows" in out) good.push(...out.rows);
      else { bad++; if (examples.length < 3) examples.push(`row ${i + 2}: ${out.error}`); }
    });
    setRows(good); setProblems({ count: bad, examples });
  }
  async function run() {
    if (!rows || !file) return; setBusy(true); setMsg(null); let saved = 0, invalid = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const res = await fetch("/api/retention/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: rows.slice(i, i + 500), source: file.name }) });
      const j = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: j.error ?? "Import failed" }); setBusy(false); return; }
      saved += j.saved; invalid += j.invalid;
    }
    const skipped = invalid + problems.count;
    setBusy(false); setMsg({ ok: true, text: `Saved ${saved.toLocaleString()} past filings${skipped ? `; skipped ${skipped.toLocaleString()} rows that could not be used` : ""}.` });
    setRows(null); setFile(null); if (input.current) input.current.value = ""; router.refresh();
  }
  function template() {
    const blob = new Blob(["﻿" + TEMPLATE_HEADERS.join(",") + "\r\n"], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "past-filers-template.csv"; a.click(); URL.revokeObjectURL(a.href);
  }
  return (
    <section className="panel p-5 mb-6">
      <h2 className="font-semibold mb-1">Import past filers</h2>
      <p className="text-sm text-muted mb-2">For customers who filed with you but are not in the system. Excel or CSV, with these columns (only Email is always required):</p>
      <p className="text-sm mb-2"><strong>Customer name</strong>, <strong>Company</strong>, <strong>Email</strong>, <strong>Phone</strong>, <strong>Registered (Central)</strong>, <strong>TY</strong> (e.g. 2026-27), <strong>First used month</strong> (e.g. Oct), <strong>Filed on</strong> (a date).</p>
      <p className="text-sm text-muted mb-4">Each row needs a Filed on date, or a TY with a First used month. Several months in one cell (Oct, Mar) become one filing each. Re-importing the same customer fills in missing details and never wipes saved ones. A file exported from Customers can be imported back.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-secondary" onClick={() => input.current?.click()}>Choose file</button>
        <button className="text-sm text-sign font-medium hover:underline" onClick={template}>Download template</button>
        <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        {file && rows && <span className="text-sm">{file.name}: <strong>{rows.length.toLocaleString()}</strong> filings ready{problems.count ? `, ${problems.count} rows skipped` : ""}</span>}
        {rows && rows.length > 0 && <button className="btn-primary" disabled={busy} onClick={run}>{busy ? "Importing…" : "Import these filings"}</button>}
      </div>
      {file && problems.examples.length > 0 && <p className="text-xs text-muted mt-2">Skipped, for example: {problems.examples.join("; ")}.</p>}
      {msg && <p className={`text-sm mt-3 ${msg.ok ? "text-sign" : "text-brick"}`}>{msg.text}</p>}
    </section>
  );
}
