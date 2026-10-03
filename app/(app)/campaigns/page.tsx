import Link from "next/link";
import { PageHeader, StatusPill, Empty } from "@/components/ui";
import { n, pct } from "@/lib/format";
import { campaignsWithStats } from "@/lib/dash";
import { centralLabel } from "@/lib/schedule";

export const dynamic = "force-dynamic";

const flow = [
  { n: 1, t: "Add leads", d: "Import a file. Your existing contacts arrive by themselves with the daily sync.", href: "/leads/import" },
  { n: 2, t: "Create a campaign", d: "Choose who gets it, write the emails, and send yourself a test.", href: "/campaigns/new" },
  { n: 3, t: "Send now or schedule", d: "Pick a date and time on the calendar, or start right away.", href: "/campaigns/new" },
];

export default async function Campaigns() {
  const data = await campaignsWithStats();
  return (
    <>
      <PageHeader title="Campaigns" sub="Each campaign is a sequence of emails sent a few days apart." action={<Link href="/campaigns/new" className="btn-primary">New campaign</Link>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        {flow.map((f) => (
          <Link key={f.n} href={f.href} className="panel p-4 hover:bg-slate block">
            <div className="flex items-center gap-3 mb-1"><span className="inline-grid place-items-center w-6 h-6 rounded-full bg-sign text-white text-xs font-bold">{f.n}</span><span className="font-semibold">{f.t}</span></div>
            <p className="text-sm text-muted">{f.d}</p>
          </Link>))}
      </div>
      {data?.length ? (
        <div className="panel overflow-hidden"><table className="table">
          <thead><tr><th>Name</th><th>Status</th><th className="text-right">Enrolled</th><th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">Opened</th><th className="text-right">Clicked</th><th className="text-right">Converted</th></tr></thead>
          <tbody>{data.map((c: any) => { const s = c.campaign_stats?.[0] ?? {}; return (
            <tr key={c.id}><td><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td>
              <td><StatusPill status={c.status} />{c.status === "scheduled" && c.scheduled_at && <div className="text-xs text-muted mt-1">{centralLabel(new Date(c.scheduled_at))}</div>}</td>
              <td className="text-right">{n(s.enrolled)}</td><td className="text-right">{n(s.sent)}</td><td className="text-right">{pct(s.delivered ?? 0, s.sent ?? 0)}</td>
              <td className="text-right">{pct(s.opened ?? 0, s.delivered ?? 0)}</td><td className="text-right">{pct(s.clicked ?? 0, s.delivered ?? 0)}</td><td className="text-right text-sign font-semibold">{n(s.converted)}</td></tr>); })}</tbody>
        </table></div>
      ) : <Empty title="No campaigns yet" body="Pick who to reach, write the first email and the follow-ups, then send now or schedule it. Contacts who become customers drop out automatically." cta="New campaign" href="/campaigns/new" />}
    </>
  );
}
