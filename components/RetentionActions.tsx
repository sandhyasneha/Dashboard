"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RetentionActions({ ty, month, notYet }: { ty: number; month: number | null; notYet: number }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function start() {
    if (!confirm(`Create a renewal campaign for ${notYet} customers who have not filed again? It starts as a draft you can review.`)) return;
    setBusy(true); setMsg("");
    const res = await fetch("/api/retention", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tax_year: ty, month }) });
    const j = await res.json(); setBusy(false);
    if (!res.ok) { setMsg(j.error ?? "Failed"); return; }
    router.push(`/campaigns/${j.id}`);
  }
  return (
    <div className="flex items-center gap-3">
      <a className="btn-secondary" href={`/api/retention?ty=${ty}${month ? `&m=${month}` : ""}&format=csv`}>Download CSV</a>
      <button className="btn-primary" disabled={busy || !notYet} onClick={start}>{busy ? "Creating…" : "Start renewal campaign"}</button>
      {msg && <span className="text-sm text-brick">{msg}</span>}
    </div>
  );
}
