import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat } from "@/components/ui";
import { MonthlyBars } from "@/components/Charts";
import { activeTaxYear, filingsSeries, money, tyLabel } from "@/lib/dash";
import { n } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Filings({ searchParams }: { searchParams: { ty?: string } }) {
  const sb = supabaseAdmin();
  const active = await activeTaxYear();
  const ty = Number(searchParams.ty ?? active);
  const { data: periods } = await sb.from("ttp_tax_periods").select("tax_year").order("tax_year", { ascending: false });
  const [cur, prev] = await Promise.all([filingsSeries(ty), filingsSeries(ty - 1)]);
  const merged = cur.map((r, i) => ({ ...r, prev_filed: prev[i].filed, prev_revenue: prev[i].revenue, prev_vehicles: prev[i].vehicles }));
  const sum = (k: "filed" | "revenue" | "vehicles", s = cur) => s.reduce((a, r) => a + r[k], 0);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs ${tyLabel(ty - 1)}` : "no prior-year data");

  return (
    <>
      <PageHeader title="Filings & revenue" sub="Completed returns only (status 4). Month is when the return was marked completed. Revenue is TruckTaxPro's service fee, not the IRS tax."
        action={<div className="flex gap-1">{(periods ?? []).map((p) => <Link key={p.tax_year} href={`?ty=${p.tax_year}`} className={`btn h-8 ${p.tax_year === ty ? "bg-ink text-white border-ink" : "btn-secondary"}`}>{tyLabel(p.tax_year)}</Link>)}</div>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Returns completed" value={sum("filed")} tone="sign" sub={delta(sum("filed"), sum("filed", prev))} />
        <Stat label="Service-fee revenue" value={money(sum("revenue"))} tone="sign" sub={delta(sum("revenue"), sum("revenue", prev))} />
        <Stat label="Vehicles on returns" value={sum("vehicles")} sub={delta(sum("vehicles"), sum("vehicles", prev))} />
      </div>
      <section className="panel p-5 mb-6"><h2 className="font-semibold mb-3">Returns completed by month</h2><MonthlyBars data={merged} dataKey="filed" current={tyLabel(ty)} previous={tyLabel(ty - 1)} /></section>
      <section className="panel p-5 mb-6"><h2 className="font-semibold mb-3">Service-fee revenue by month</h2><MonthlyBars data={merged} dataKey="revenue" current={tyLabel(ty)} previous={tyLabel(ty - 1)} currency /></section>
      <section className="panel overflow-hidden"><table className="table">
        <thead><tr><th>Month</th><th className="text-right">Returns</th><th className="text-right">{tyLabel(ty - 1)}</th><th className="text-right">Revenue</th><th className="text-right">{tyLabel(ty - 1)}</th><th className="text-right">Vehicles</th></tr></thead>
        <tbody>{merged.map((r) => (<tr key={r.key}><td className="font-medium">{r.month} {r.key.slice(0, 4)}</td><td className="text-right">{n(r.filed)}</td><td className="text-right text-muted">{n(r.prev_filed)}</td><td className="text-right">{money(r.revenue)}</td><td className="text-right text-muted">{money(r.prev_revenue)}</td><td className="text-right">{n(r.vehicles)}</td></tr>))}</tbody>
        <tfoot><tr className="font-semibold"><td>Total</td><td className="text-right">{n(sum("filed"))}</td><td className="text-right text-muted">{n(sum("filed", prev))}</td><td className="text-right">{money(sum("revenue"))}</td><td className="text-right text-muted">{money(sum("revenue", prev))}</td><td className="text-right">{n(sum("vehicles"))}</td></tr></tfoot>
      </table></section>
    </>
  );
}
