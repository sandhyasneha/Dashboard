import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat, StatusPill } from "@/components/ui";
import { MonthlyBars, StatusDonut } from "@/components/Charts";
import { FIRST_TAX_YEAR, activeTaxYear, campaignsWithStats, filingsSeries, lastSync, money, tyLabel } from "@/lib/dash";
import { n, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const sb = supabaseAdmin();
  const ty = await activeTaxYear();
  const head = { count: "exact" as const, head: true };
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [series, prevSeries, status, sync, users, usersThisMonth, filedThisMonth, revThisMonth, leads, customers, month, settings, campaigns, paying] = await Promise.all([
    filingsSeries(ty), ty > FIRST_TAX_YEAR ? filingsSeries(ty - 1) : Promise.resolve(null),
    sb.rpc("dash_status_breakdown", { p_tax_year: ty }),
    lastSync(),
    sb.from("ttp_users").select("user_id", head),
    sb.from("ttp_users").select("user_id", head).gte("registered_at", monthStart.toISOString()),
    sb.from("ttp_filings").select("filing_id", head).not("paid_at", "is", null).gte("paid_at", monthStart.toISOString()),
    sb.from("ttp_payments").select("amount").eq("is_paid", true).gte("paid_on", monthStart.toISOString()),
    sb.from("leads").select("id", head), sb.from("leads").select("id", head).eq("is_customer", true),
    sb.from("sends_this_month").select("n").single(), sb.from("settings").select("*").eq("id", 1).single(),
    campaignsWithStats({ status: "running", limit: 3 }).then((data) => ({ data })),
    sb.rpc("dash_unique_filers"),
  ]);
  const filedTY = series.reduce((a, r) => a + r.filed, 0);
  const revTY = series.reduce((a, r) => a + r.revenue, 0);
  const revMonth = (revThisMonth.data ?? []).reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0);
  const merged = series.map((r, i) => ({ ...r, prev_filed: prevSeries?.[i].filed ?? 0, prev_revenue: prevSeries?.[i].revenue ?? 0 }));

  return (
    <>
      <PageHeader title={`Overview · ${tyLabel(ty)}`} sub={sync ? `Production data as of ${when(sync.finished_at ?? sync.started_at)}${sync.error ? " · last sync failed" : ""}` : "Waiting for the first sync from the server"} />

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label={`Paid returns · ${tyLabel(ty)}`} value={filedTY} tone="sign" sub={`${n(filedThisMonth.count ?? 0)} this month`} />
        <Stat label="Service-fee revenue" value={money(revTY)} tone="sign" sub={`${money(revMonth)} this month`} />
        <Stat label="Registered users" value={users.count ?? 0} sub={`${n(usersThisMonth.count ?? 0)} new this month`} />
        <Stat label="Paying customers" value={Number(paying.data ?? 0)} tone="sign" sub={`${pct(Number(paying.data ?? 0), users.count ?? 0)} of registered users`} />
      </div>

      <div className="grid grid-cols-[1.6fr_1fr] gap-6 mb-6">
        <section className="panel p-5">
          <div className="flex items-baseline justify-between mb-3"><h2 className="font-semibold">Paid returns by month</h2><Link href="/dashboard/filings" className="text-sm text-sign font-medium">Details</Link></div>
          <MonthlyBars data={merged} dataKey="filed" current={tyLabel(ty)} previous={prevSeries ? tyLabel(ty - 1) : undefined} />
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold mb-3">Return status · {tyLabel(ty)}</h2>
          <StatusDonut data={(status.data ?? []) as any} />
        </section>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-6">
        <section className="panel">
          <div className="flex items-center justify-between px-5 py-4 border-b border-line"><h2 className="font-semibold">Campaigns running</h2><Link href="/campaigns" className="text-sm text-sign font-medium">See all</Link></div>
          {campaigns.data?.length ? (
            <table className="table"><thead><tr><th>Name</th><th className="text-right">Sent</th><th className="text-right">Opened</th><th className="text-right">Converted</th></tr></thead>
              <tbody>{campaigns.data.map((c: any) => { const s = c.campaign_stats?.[0] ?? {}; return (
                <tr key={c.id}><td><Link href={`/campaigns/${c.id}`} className="font-medium hover:underline">{c.name}</Link></td><td className="text-right">{n(s.sent)}</td><td className="text-right">{pct(s.opened ?? 0, s.delivered ?? 0)}</td><td className="text-right text-sign font-semibold">{n(s.converted)}</td></tr>); })}</tbody></table>
          ) : <p className="px-5 py-8 text-sm text-muted">Nothing is sending right now.</p>}
        </section>
        <section className="panel p-5">
          <h2 className="font-semibold mb-3">Email pipeline</h2>
          <dl className="text-sm space-y-2.5">
            <div className="flex justify-between"><dt className="text-muted">Leads on file</dt><dd className="font-semibold">{n(leads.count ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Leads who became customers</dt><dd className="font-semibold text-sign">{n(customers.count ?? 0)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Emails sent this month</dt><dd className="font-semibold">{n(month.data?.n ?? 0)} <span className="text-muted font-normal">of {n(settings.data?.monthly_cap ?? 20000)}</span></dd></div>
          </dl>
          <div className="h-2 rounded-full bg-slate overflow-hidden mt-4"><div className="h-full bg-sign" style={{ width: `${Math.min(100, ((month.data?.n ?? 0) / (settings.data?.monthly_cap ?? 20000)) * 100)}%` }} /></div>
        </section>
      </div>
    </>
  );
}
