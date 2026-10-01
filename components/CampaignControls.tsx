"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CampaignControls({ id, status }: { id: string; status: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false);
  async function set(next: string) {
    setBusy(true);
    await fetch("/api/campaigns", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status: next }) });
    router.refresh(); setBusy(false);
  }
  if (status === "completed") return null;
  return (
    <div className="flex gap-2">
      {status !== "running" && <button className="btn-primary" disabled={busy} onClick={() => set("running")}>{status === "paused" ? "Resume" : "Start sending"}</button>}
      {status === "running" && <button className="btn-secondary" disabled={busy} onClick={() => set("paused")}>Pause</button>}
      {status !== "draft" && <button className="btn-danger" disabled={busy} onClick={() => { if (confirm("End this campaign? Remaining follow-ups won't be sent.")) set("completed"); }}>End</button>}
    </div>
  );
}
