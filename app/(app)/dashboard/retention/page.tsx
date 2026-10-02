import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat } from "@/components/ui";
import { activeTaxYear, fetchLapsed, tyLabel } from "@/lib/dash";
import { RetentionActions } from "@/components/RetentionActions";
import { n, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";
const SHOW = 200;

export default async function Retention() {
  const sb = supabaseAdmin();
  const ty = await activeTaxYear();
  const [rows, counts] = await Promise.all([fetchLapsed(ty - 1, ty), sb.rpc("dash_retention_counts", { p_prev: ty - 1, p_curr: ty })]);
  const c = (counts.data?.[0] ?? { prev_filers: 0, returned: 0 }) as { prev_filers: number; returned: number };
  const inSeq = rows.filter((r) => r.in_sequence).length;

  return (
    <>
      <PageHeader title="Retention" sub={`Customers who completed a return in ${tyLabel(ty - 1)} but haven't yet in ${tyLabel(ty)}. This list updates with every sync.`}
        action={<RetentionActions taxYear={ty} count={rows.length} />} />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label={`Filed in ${tyLabel(ty - 1)}`} value={c.prev_filers} />
        <Stat label={`Returned in ${tyLabel(ty)}`} value={c.returned} tone="sign" sub={pct(c.returned, c.prev_filers) + " retained so far"} />
        <Stat label="Not yet returned" value={rows.length} tone="amber" />
        <Stat label="In a follow-up sequence" value={inSeq} sub={`${n(rows.length - inSeq)} not yet contacted`} />
      </div>
      {rows.length ? (
        <section className="panel overflow-hidden"><table className="table">
          <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Last completed</th><th className="text-right">Vehicles</th><th>Follow-up</th></tr></thead>
          <tbody>{rows.slice(0, SHOW).map((r) => (
            <tr key={r.email}><td className="font-medium">{r.name ?? "\u2014"}</td><td className="text-muted">{r.email}</td><td className="text-muted">{r.phone ?? "\u2014"}</td><td className="text-muted">{when(r.last_filed_at)}</td><td className="text-right">{r.vehicles ?? "\u2014"}</td>
              <td>{r.in_sequence ? <span className="pill bg-amberSoft text-amber">In sequence</span> : r.lead_status === "unsubscribed" ? <span className="pill bg-slate text-muted">Unsubscribed</span> : <span className="pill bg-slate text-ink">Not contacted</span>}</td></tr>))}</tbody>
        </table>
        {rows.length > SHOW && <p className="px-4 py-3 border-t border-line text-sm text-muted">Showing the {SHOW} most recent of {n(rows.length)}. Download the CSV for the full list.</p>}</section>
      ) : <div className="panel px-8 py-14 text-center"><h2 className="text-lg font-semibold">Nobody has lapsed</h2><p className="text-muted mt-1">Either every {tyLabel(ty - 1)} filer has returned, or {tyLabel(ty - 1)} data hasn't been synced yet.</p></div>}
    </>
  );
}
