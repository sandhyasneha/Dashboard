"use client";
import { useRef, useState } from "react";
import * as XLSX from "xlsx";

type Totals = { received: number; valid: number; suppressed: number; inserted: number; updated: number };
const zero: Totals = { received: 0, valid: 0, suppressed: 0, inserted: 0, updated: 0 };

export function Importer() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false); const [listName, setListName] = useState("");

  async function load(f: File) {
    setErr(""); setTotals(null); setFile(f); setListName(f.name.replace(/\.[^.]+$/, ""));
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
    setRows(data);
  }

  async function run() {
    if (!rows || !file) return;
    setBusy(true); setProgress(0); const t = { ...zero };
    const size = 500;
    for (let i = 0; i < rows.length; i += size) {
      const res = await fetch("/api/leads/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows: rows.slice(i, i + size), source_file: file.name, list_name: listName }) });
      if (!res.ok) { setErr(`Import stopped at row ${i}: ${(await res.json()).error}`); break; }
      const r: Totals = await res.json();
      (Object.keys(t) as (keyof Totals)[]).forEach((k) => (t[k] += r[k]));
      setProgress(Math.min(rows.length, i + size)); setTotals({ ...t });
    }
    setBusy(false);
  }

  const headers = rows?.[0] ? Object.keys(rows[0]) : [];
  return (
    <div className="grid grid-cols-[1fr_320px] gap-6 items-start">
      <div className="panel p-6">
        <div className="border-2 border-dashed border-line rounded-lg p-10 text-center"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) load(f); }}>
          <p className="font-medium">Drop a file here</p>
          <p className="text-sm text-muted mt-1">.xlsx or .csv, any size the browser can open</p>
          <button className="btn-secondary mt-4" onClick={() => input.current?.click()}>Choose file</button>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </div>

        {rows && (
          <div className="mt-6">
            <div className="flex items-baseline justify-between"><div className="font-semibold">{file?.name}</div><div className="text-sm text-muted">{rows.length.toLocaleString()} rows</div></div>
            <div className="text-sm text-muted mt-1">Columns found: {headers.join(", ")}</div>
            <div className="mt-4 overflow-x-auto panel">
              <table className="table"><thead><tr>{headers.slice(0, 6).map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}>{headers.slice(0, 6).map((h) => <td key={h} className="text-muted whitespace-nowrap">{String(r[h])}</td>)}</tr>)}</tbody></table>
            </div>
            <div className="mt-5 max-w-sm">
              <label className="label" htmlFor="listname">List name</label>
              <input id="listname" className="input" value={listName} onChange={(e) => setListName(e.target.value)} placeholder="for example Past customers" />
              <p className="text-xs text-muted mt-1">You pick this name in a campaign to choose who gets it. Only the email and phone columns are kept.</p>
            </div>
            <div className="flex items-center gap-4 mt-5">
              <button className="btn-primary" onClick={run} disabled={busy}>{busy ? "Importing…" : totals ? "Import again" : "Import these leads"}</button>
              {busy && <span className="text-sm text-muted">{progress.toLocaleString()} of {rows.length.toLocaleString()}</span>}
            </div>
            {busy && <div className="h-1.5 rounded-full bg-slate mt-3 overflow-hidden"><div className="h-full bg-sign" style={{ width: `${(progress / rows.length) * 100}%` }} /></div>}
            {err && <p className="text-sm text-brick mt-3">{err}</p>}
          </div>
        )}
      </div>

      <aside className="panel p-5">
        <h2 className="font-semibold mb-3">{totals ? "Result" : "What happens on import"}</h2>
        {totals ? (
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Rows read</dt><dd>{totals.received.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Valid emails</dt><dd>{totals.valid.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">New leads</dt><dd className="text-sign font-semibold">{totals.inserted.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Already on file, refreshed</dt><dd>{totals.updated.toLocaleString()}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Skipped (suppressed)</dt><dd className="text-brick">{totals.suppressed.toLocaleString()}</dd></div>
          </dl>
        ) : (
          <ul className="text-sm text-muted space-y-2 list-disc pl-4">
            <li>Emails are lower-cased and validated.</li>
            <li>A carrier already on file is refreshed, not duplicated.</li>
            <li>Unsubscribed, bounced, or complained addresses are never re-added.</li>
            <li>Only email and phone are kept, with the list name you choose.</li>
            <li>Leads land as <strong>new</strong>; a campaign picks them up from there.</li>
          </ul>
        )}
      </aside>
    </div>
  );
}
