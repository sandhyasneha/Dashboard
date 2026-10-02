import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, StatusPill, Empty } from "@/components/ui";
import { n, pct } from "@/lib/format";
import { campaignsWithStats } from "@/lib/dash";

export const dynamic = "force-dynamic";

export default async function Campaigns() {
  const data = await campaignsWithStats();
  return (
    <>
      <PageHeader title="Campaigns" sub="Each campaign is a sequence of emails sent a few days apart." action={<Link href="/campaigns/new" className="btn-primary">New campaign</Link>} />
      {data?.length ? (
        <div className="panel overflow-hidden"><table className="table">
          <thead><tr><th>Name</th><th>Status</th><th className="text-right">Enrolled</th><th className="text-right">Sent</th><th className="text-right">Delivered</th><th className="text-right">Opened</th><th className="text-right">Clicked</th><th className="text-right">Converted</th></tr></thead>
          <tbody>{data.map((c: any) => { const s = c.campaign_stats?.[0] ?? {}; return (
            <tr key={c.id}><td><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td><td><StatusPill status={c.status} /></td>
              <td className="text-right">{n(s.enrolled)}</td><td className="text-right">{n(s.sent)}</td><td className="text-right">{pct(s.delivered ?? 0, s.sent ?? 0)}</td>
              <td className="text-right">{pct(s.opened ?? 0, s.delivered ?? 0)}</td><td className="text-right">{pct(s.clicked ?? 0, s.delivered ?? 0)}</td><td className="text-right text-sign font-semibold">{n(s.converted)}</td></tr>); })}</tbody>
        </table></div>
      ) : <Empty title="No campaigns yet" body="Pick who to reach, write the first email and the follow-ups, and set a daily limit. Leads who become customers drop out automatically." cta="New campaign" href="/campaigns/new" />}
    </>
  );
}
