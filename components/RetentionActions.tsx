"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RetentionActions({ taxYear, count }: { taxYear: number; count: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function enroll() {
    if (!confirm(`Create a renewal campaign for ${count} lapsed customers? It starts as a draft you can edit.`)) return;
    setBusy(true);
    const res = await fetch("/api/retention", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tax_year: taxYear }) });
    const j = await res.json(); setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "Failed"); return; }
    router.push(`/campaigns/${j.id}`);
  }
  return (
    <div className="flex items-center gap-3">
      <a className="btn-secondary" href={`/api/retention?tax_year=${taxYear}&format=csv`}>Download CSV</a>
      <button className="btn-primary" disabled={busy || !count} onClick={enroll}>{busy ? "Creating…" : "Start renewal campaign"}</button>
      {msg && <span className="text-sm text-brick">{msg}</span>}
    </div>
  );
}
