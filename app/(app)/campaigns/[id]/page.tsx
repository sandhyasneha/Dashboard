import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat, StatusPill } from "@/components/ui";
import { CampaignControls } from "@/components/CampaignControls";
import { SequenceRoad } from "@/components/SequenceRoad";
import { TestSend } from "@/components/TestSend";
import { centralLabel } from "@/lib/schedule";
import { DailyLimit } from "@/components/DailyLimit";
import { n, pct, when, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const sb = supabaseAdmin();
  const [{ data: c }, { data: steps }, { data: stats }, { data: recent }] = await Promise.all([
    sb.from("campaigns").select("*").eq("id", params.id).maybeSingle(),
    sb.from("campaign_steps").select("*").eq("campaign_id", params.id).order("position"),
    sb.from("campaign_stats").select("*").eq("campaign_id", params.id).maybeSingle(),
    sb.from("messages").select("subject, sent_at, last_event, step_position, lead:leads(email, company_name, state)").eq("campaign_id", params.id).order("sent_at", { ascending: false }).limit(25),
  ]);
  if (!c) notFound();
  const s = stats ?? { enrolled: 0, active: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, converted: 0 };

  // Per-step counts for the road: how many enrollments have reached each step.
  const perStep = await Promise.all((steps ?? []).map(async (st) => {
    const { count } = await sb.from("messages").select("id", { count: "exact", head: true }).eq("campaign_id", c.id).eq("step_position", st.position);
    return count ?? 0;
  }));

  return (
    <>
      <PageHeader title={c.name} sub={`Created ${when(c.created_at)} · up to ${n(c.daily_cap)} emails a day${c.status === "scheduled" && c.scheduled_at ? ` · starts ${centralLabel(new Date(c.scheduled_at))}` : ""}`}
        action={<div className="flex items-center gap-3"><StatusPill status={c.status} /><CampaignControls id={c.id} status={c.status} /></div>} />

      {c.status !== "completed" && <DailyLimit id={c.id} value={c.daily_cap} />}

      <div className="grid grid-cols-5 gap-4 mb-8">
        <Stat label="Enrolled" value={s.enrolled} sub={`${n(s.active)} still active`} />
        <Stat label="Delivered" value={s.delivered} sub={pct(s.delivered, s.sent) + " of sent"} />
        <Stat label="Opened" value={s.opened} sub={pct(s.opened, s.delivered) + " of delivered"} />
        <Stat label="Clicked" value={s.clicked} sub={pct(s.clicked, s.delivered) + " of delivered"} />
        <Stat label="Became customers" value={s.converted} tone="sign" sub={pct(s.converted, s.enrolled) + " of enrolled"} />
      </div>

      <section className="panel p-6 mb-8">
        <h2 className="font-semibold mb-1">Sequence</h2>
        <p className="text-sm text-muted mb-6">Carriers move along the road; anyone who files on trucktaxpro.com exits early.</p>
        <SequenceRoad steps={(steps ?? []).map((st, i) => ({ label: i === 0 ? "First email" : `Follow-up ${i}`, subject: st.subject, delay: st.delay_days, count: perStep[i] }))} enrolled={s.enrolled} converted={s.converted} bounced={s.bounced} />
        <TestSend campaignId={c.id} steps={(steps ?? []).length} />
      </section>

      <section className="panel">
        <div className="px-5 py-4 border-b border-line"><h2 className="font-semibold">Recent sends</h2></div>
        {recent?.length ? (
          <table className="table"><thead><tr><th>Carrier</th><th>Email</th><th>Step</th><th>Subject</th><th>Last event</th><th>Sent</th></tr></thead>
            <tbody>{recent.map((m: any, i: number) => (
              <tr key={i}><td className="font-medium">{titleCase(m.lead?.company_name) || "—"} <span className="text-muted">{m.lead?.state}</span></td><td className="text-muted">{m.lead?.email}</td><td>{m.step_position}</td>
                <td className="text-muted max-w-xs truncate">{m.subject}</td><td><StatusPill status={m.last_event === "bounced" || m.last_event === "complained" ? "bounced" : m.last_event === "opened" || m.last_event === "clicked" ? "customer" : "new"} /> <span className="text-xs text-muted">{m.last_event}</span></td><td className="text-muted whitespace-nowrap">{when(m.sent_at)}</td></tr>))}</tbody></table>
        ) : <p className="px-5 py-8 text-sm text-muted">{c.status === "draft" ? "Start the campaign or schedule it to begin sending. Emails go out within 15 minutes, during the send window (weekdays, 9 AM to 5 PM Central)." : c.status === "scheduled" ? "Scheduled. Nothing is sent until the start time." : "Nothing sent yet."}</p>}
      </section>
    </>
  );
}
