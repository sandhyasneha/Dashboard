import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat } from "@/components/ui";
import { FIRST_TAX_YEAR, cohortArgs, cohortPage, currentTaxYear, tyLabel } from "@/lib/dash";
import { DEFAULT_STEPS, MONTH_NAMES, loadSteps } from "@/lib/retention";
import { RetentionActions } from "@/components/RetentionActions";
import { RetentionImport } from "@/components/RetentionImport";
import { RetentionAuto } from "@/components/RetentionAuto";
import { Pager } from "@/components/Pager";
import { n, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";
const SEASON = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]; // calendar months in tax-year order

export default async function Retention({ searchParams }: { searchParams: { ty?: string; m?: string; q?: string; f?: string; p?: string } }) {
  const sb = supabaseAdmin();
  const cur = Math.max(FIRST_TAX_YEAR, currentTaxYear());
  const years = Array.from({ length: cur - FIRST_TAX_YEAR + 1 }, (_, i) => FIRST_TAX_YEAR + i);
  const ty = years.includes(Number(searchParams.ty)) ? Number(searchParams.ty) : cur;
  const month = Number(searchParams.m) >= 1 && Number(searchParams.m) <= 12 ? Number(searchParams.m) : null;

  const filter = searchParams.f === "again" || searchParams.f === "notyet" ? searchParams.f : "all";
  const q = (searchParams.q ?? "").slice(0, 60);
  const [byMonth, listed, seq, drafts, auto, imported] = await Promise.all([
    sb.rpc("retention_by_month", { p_tax_year: ty }),
    cohortPage(ty, month, { q, filter, page: Number(searchParams.p) }),
    sb.rpc("retention_cohort", cohortArgs(ty, month), { count: "exact" }).eq("returned", false).eq("in_sequence", true).range(0, 0),
    sb.from("campaigns").select("id, name, created_at").eq("auto_source", "retention").eq("status", "draft").order("created_at", { ascending: false }).limit(3),
    sb.from("retention_auto").select("*").eq("id", 1).maybeSingle(),
    sb.from("retention_imports").select("id", { count: "exact", head: true }).eq("tax_year", ty),
  ]);
  const notSetUp = !!byMonth.error;
  const grid = new Map<number, { cohort: number; returned: number }>(((byMonth.data ?? []) as { month: number; cohort: number; returned: number }[]).map((r) => [r.month, r]));
  const all = grid.get(0) ?? { cohort: 0, returned: 0 };
  const rows = listed.rows;
  const total = month ? (grid.get(month) ?? { cohort: 0, returned: 0 }) : all;
  const size = total.cohort, again = total.returned, notYet = size - again;
  const inSeq = seq.count ?? 0;
  const calYear = (m: number) => (m >= 7 ? ty : ty + 1);
  const label = month ? `${MONTH_NAMES[month - 1]} ${calYear(month)}` : `all of ${tyLabel(ty)}`;
  const href = (m: number | null) => `/dashboard/retention?ty=${ty}${m ? `&m=${m}` : ""}`;
  const cfg = auto.data ? { enabled: auto.data.enabled, mode: auto.data.mode, send_day: auto.data.send_day, daily_cap: auto.data.daily_cap, steps: loadSteps(auto.data.steps), last_result: auto.data.last_result } : { enabled: false, mode: "review" as const, send_day: 1, daily_cap: 50, steps: DEFAULT_STEPS, last_result: null };

  return (
    <>
      <PageHeader title="Retention" sub={`Customers who paid for a return in ${label}, and whether they have paid again in ${tyLabel(ty + 1)}. Updates with every daily sync.`}
        action={<RetentionActions ty={ty} month={month} notYet={notYet} />} />
      {notSetUp && <div className="panel p-4 mb-6 bg-amberSoft text-sm">Retention needs one database update. Run <code>supabase/patch-008.sql</code> in the Supabase SQL editor, then reload.</div>}

      {drafts.data?.length ? (
        <section className="panel p-5 mb-6 border-sign">
          <h2 className="font-semibold mb-2">Ready to review</h2>
          <p className="text-sm text-muted mb-3">Monthly renewals created these drafts. Open one, check it, send yourself a test, then press Start now.</p>
          <ul className="text-sm space-y-1">{drafts.data.map((d: any) => <li key={d.id}><Link href={`/campaigns/${d.id}`} className="text-sign font-medium hover:underline">{d.name}</Link> <span className="text-muted">· created {when(d.created_at)}</span></li>)}</ul>
        </section>) : null}

      <div className="flex gap-1 mb-6">{years.map((y) => <Link key={y} href={`/dashboard/retention?ty=${y}`} className={`btn h-8 ${y === ty ? "bg-ink text-white border-ink" : "btn-secondary"}`}>Filed in {tyLabel(y)}</Link>)}</div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label={`Filed in ${label}`} value={size} sub={imported.count ? `${n(imported.count)} imported past filings in ${tyLabel(ty)}` : undefined} />
        <Stat label={`Filed again in ${tyLabel(ty + 1)}`} value={again} tone="sign" sub={size ? pct(again, size) + " retained" : "nobody yet"} />
        <Stat label="Not yet" value={notYet} tone="amber" />
        <Stat label="In a follow-up sequence" value={inSeq} sub={`${n(notYet - inSeq)} not yet contacted`} />
      </div>

      <section className="panel overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-line"><h2 className="font-semibold">By month · {tyLabel(ty)}</h2><p className="text-sm text-muted mt-1">Pick a month to see who filed then. A customer who filed in two months appears in both rows, and once in the total.</p></div>
        <table className="table">
          <thead><tr><th>Filed in</th><th className="text-right">Customers</th><th className="text-right">Filed again in {tyLabel(ty + 1)}</th><th className="text-right">Not yet</th><th className="text-right">Retained</th></tr></thead>
          <tbody>
            <tr className={month === null ? "bg-signSoft" : ""}><td><Link href={href(null)} className="font-semibold hover:underline">All months</Link></td><td className="text-right">{n(all.cohort)}</td><td className="text-right">{n(all.returned)}</td><td className="text-right">{n(all.cohort - all.returned)}</td><td className="text-right">{all.cohort ? pct(all.returned, all.cohort) : "—"}</td></tr>
            {SEASON.map((m) => { const g = grid.get(m) ?? { cohort: 0, returned: 0 }; return (
              <tr key={m} className={month === m ? "bg-signSoft" : ""}><td><Link href={href(m)} className="font-medium hover:underline">{MONTH_NAMES[m - 1]} {calYear(m)}</Link></td><td className="text-right">{n(g.cohort)}</td><td className="text-right">{n(g.returned)}</td><td className="text-right">{n(g.cohort - g.returned)}</td><td className="text-right">{g.cohort ? pct(g.returned, g.cohort) : "—"}</td></tr>); })}
          </tbody>
        </table>
      </section>

      <section className="panel overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Customers · {label}</h2>
          <form action="/dashboard/retention" className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="ty" value={ty} />{month ? <input type="hidden" name="m" value={month} /> : null}
            <input className="input h-9 w-64" name="q" placeholder="Search email, name or phone" defaultValue={q} />
            <select className="input h-9 w-40" name="f" defaultValue={filter}><option value="all">Everyone</option><option value="again">Filed again</option><option value="notyet">Not yet</option></select>
            <button className="btn-secondary h-9">Search</button>
            {(q || filter !== "all") && <Link href={href(month)} className="text-sm text-sign font-medium hover:underline">Clear</Link>}
          </form>
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Filed</th><th className="text-right">Vehicles</th><th>Source</th><th>Filed again</th><th>Follow-up</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.email}><td className="font-medium">{r.name ?? "—"}</td><td className="text-muted">{r.email}</td><td className="text-muted whitespace-nowrap">{r.phone ?? "—"}</td><td className="text-muted whitespace-nowrap">{when(r.cohort_at)}</td><td className="text-right">{r.vehicles || "—"}</td><td className="text-muted">{r.source}</td>
                  <td className="whitespace-nowrap">{r.returned ? <span className="pill bg-signSoft text-sign">Yes · {when(r.returned_at)}</span> : <span className="pill bg-amberSoft text-amber">Not yet</span>}</td>
                  <td className="whitespace-nowrap">{r.returned ? <span className="text-muted">—</span> : r.in_sequence ? <span className="pill bg-amberSoft text-amber">In sequence</span> : r.lead_status === "unsubscribed" ? <span className="pill bg-slate text-muted">Unsubscribed</span> : <span className="pill bg-slate text-ink">Not contacted</span>}</td></tr>))}</tbody>
            </table>
          </div>) : <p className="px-5 py-10 text-sm text-muted text-center">{q || filter !== "all" ? "No customers match that search." : <>Nobody filed in {label} yet. Customers appear here after they pay for a return and the daily sync runs. If you have older customers, use Import past filers below.</>}</p>}
        <Pager path="/dashboard/retention" params={{ ty: String(ty), m: month ? String(month) : undefined, q: q || undefined, f: filter !== "all" ? filter : undefined }} page={listed.page} pageSize={listed.size} total={listed.total} />
      </section>

      <RetentionImport />
      <RetentionAuto initial={cfg as any} missing={!auto.data} />
    </>
  );
}
