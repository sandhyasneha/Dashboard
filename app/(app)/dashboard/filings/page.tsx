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
  const [{ data: rs }, { data: coupons }] = await Promise.all([sb.rpc("dash_revenue_summary", { p_tax_year: ty }), sb.rpc("dash_coupon_summary", { p_tax_year: ty })]);
  const summary = (rs?.[0] ?? { collected: 0, discounts: 0, gross: 0, payments: 0 }) as { collected: number; discounts: number; gross: number; payments: number };
  const merged = cur.map((r, i) => ({ ...r, prev_filed: prev[i].filed, prev_revenue: prev[i].revenue, prev_vehicles: prev[i].vehicles }));
  const sum = (k: "filed" | "revenue" | "vehicles", s = cur) => s.reduce((a, r) => a + r[k], 0);
  const delta = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}% vs ${tyLabel(ty - 1)}` : "no prior-year data");

  return (
    <>
      <PageHeader title="Filings & revenue" sub="A return counts once it is paid: status Paid, Submitted, Completed or Schedule 1 Ready. The month is when it was paid. Revenue is what Stripe actually collected for TruckTaxPro's service fee after discounts, in the month it was paid. It is not the IRS tax."
        action={<div className="flex gap-1">{(periods ?? []).map((p) => <Link key={p.tax_year} href={`?ty=${p.tax_year}`} className={`btn h-8 ${p.tax_year === ty ? "bg-ink text-white border-ink" : "btn-secondary"}`}>{tyLabel(p.tax_year)}</Link>)}</div>} />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Paid returns" value={sum("filed")} tone="sign" sub={delta(sum("filed"), sum("filed", prev))} />
        <Stat label="Service-fee revenue" value={money(sum("revenue"))} tone="sign" sub={delta(sum("revenue"), sum("revenue", prev))} />
        <Stat label="Vehicles on returns" value={sum("vehicles")} sub={delta(sum("vehicles"), sum("vehicles", prev))} />
      </div>
      <section className="panel p-5 mb-6">
        <h2 className="font-semibold mb-1">Revenue after discounts · {tyLabel(ty)}</h2>
        <p className="text-sm text-muted mb-4">The amount collected compared with the list price, from {n(summary.payments)} paid service-fee payment{summary.payments === 1 ? "" : "s"}.</p>
        <div className="grid grid-cols-3 gap-4">
          <div><div className="text-sm text-muted">List price</div><div className="text-2xl font-bold">{money(Number(summary.gross))}</div></div>
          <div><div className="text-sm text-muted">Discounts given</div><div className="text-2xl font-bold text-amber">−{money(Number(summary.discounts))}</div></div>
          <div><div className="text-sm text-muted">Collected</div><div className="text-2xl font-bold text-sign">{money(Number(summary.collected))}</div></div>
        </div>
        {coupons?.length ? (
          <table className="table mt-5"><thead><tr><th>Coupon</th><th className="text-right">Uses</th><th className="text-right">Discount given</th></tr></thead>
            <tbody>{(coupons as { coupon_code: string | null; uses: number; discount_total: number }[]).map((c) => (<tr key={c.coupon_code ?? "none"}><td className="font-medium">{c.coupon_code ?? "(no code)"}</td><td className="text-right">{n(c.uses)}</td><td className="text-right">{money(Number(c.discount_total))}</td></tr>))}</tbody></table>
        ) : null}
      </section>
      <section className="panel p-5 mb-6"><h2 className="font-semibold mb-3">Paid returns by month</h2><MonthlyBars data={merged} dataKey="filed" current={tyLabel(ty)} previous={tyLabel(ty - 1)} /></section>
      <section className="panel p-5 mb-6"><h2 className="font-semibold mb-3">Service-fee revenue by month</h2><MonthlyBars data={merged} dataKey="revenue" current={tyLabel(ty)} previous={tyLabel(ty - 1)} currency /></section>
      <section className="panel overflow-hidden"><table className="table">
        <thead><tr><th>Month</th><th className="text-right">Returns</th><th className="text-right">{tyLabel(ty - 1)}</th><th className="text-right">Revenue</th><th className="text-right">{tyLabel(ty - 1)}</th><th className="text-right">Vehicles</th></tr></thead>
        <tbody>{merged.map((r) => (<tr key={r.key}><td className="font-medium">{r.month} {r.key.slice(0, 4)}</td><td className="text-right">{n(r.filed)}</td><td className="text-right text-muted">{n(r.prev_filed)}</td><td className="text-right">{money(r.revenue)}</td><td className="text-right text-muted">{money(r.prev_revenue)}</td><td className="text-right">{n(r.vehicles)}</td></tr>))}</tbody>
        <tfoot><tr className="font-semibold"><td>Total</td><td className="text-right">{n(sum("filed"))}</td><td className="text-right text-muted">{n(sum("filed", prev))}</td><td className="text-right">{money(sum("revenue"))}</td><td className="text-right text-muted">{money(sum("revenue", prev))}</td><td className="text-right">{n(sum("vehicles"))}</td></tr></tfoot>
      </table></section>
    </>
  );
}
