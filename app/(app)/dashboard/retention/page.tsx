import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat } from "@/components/ui";
import { activeTaxYear, tyLabel } from "@/lib/dash";
import { RetentionActions } from "@/components/RetentionActions";
import { n, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Retention() {
  const sb = supabaseAdmin();
  const ty = await activeTaxYear();
  const [{ data: lapsed }, prevFilers, curFilers] = await Promise.all([
    sb.rpc("dash_lapsed", { p_prev: ty - 1, p_curr: ty }),
    sb.from("ttp_filings").select("email").eq("status_id", 4).eq("tax_year", ty - 1),
    sb.from("ttp_filings").select("email").eq("status_id", 4).eq("tax_year", ty),
  ]);
  const prevSet = new Set((prevFilers.data ?? []).map((f: any) => f.email));
  const curSet = new Set((curFilers.data ?? []).map((f: any) => f.email));
  const returned = [...prevSet].filter((e) => curSet.has(e)).length;
  const rows = (lapsed ?? []) as any[];
  const inSeq = rows.filter((r) => r.in_sequence).length;

  return (
    <>
      <PageHeader title="Retention" sub={`Customers who completed a return in ${tyLabel(ty - 1)} but haven't yet in ${tyLabel(ty)}. This list updates with every sync.`}
        action={<RetentionActions taxYear={ty} count={rows.length} />} />
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label={`Filed in ${tyLabel(ty - 1)}`} value={prevSet.size} />
        <Stat label={`Returned in ${tyLabel(ty)}`} value={returned} tone="sign" sub={pct(returned, prevSet.size) + " retained so far"} />
        <Stat label="Not yet returned" value={rows.length} tone="amber" />
        <Stat label="In a follow-up sequence" value={inSeq} sub={`${n(rows.length - inSeq)} not yet contacted`} />
      </div>
      {rows.length ? (
        <section className="panel overflow-hidden"><table className="table">
          <thead><tr><th>Customer</th><th>Email</th><th>Phone</th><th>Last completed</th><th className="text-right">Vehicles</th><th>Follow-up</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.email}><td className="font-medium">{r.name ?? "—"}</td><td className="text-muted">{r.email}</td><td className="text-muted">{r.phone ?? "—"}</td><td className="text-muted">{when(r.last_filed_at)}</td><td className="text-right">{r.vehicles ?? "—"}</td>
              <td>{r.in_sequence ? <span className="pill bg-amberSoft text-amber">In sequence</span> : r.lead_status === "unsubscribed" ? <span className="pill bg-slate text-muted">Unsubscribed</span> : <span className="pill bg-slate text-ink">Not contacted</span>}</td></tr>))}</tbody>
        </table></section>
      ) : <div className="panel px-8 py-14 text-center"><h2 className="text-lg font-semibold">Nobody has lapsed</h2><p className="text-muted mt-1">Either every {tyLabel(ty - 1)} filer has returned, or {tyLabel(ty - 1)} data hasn't been synced yet.</p></div>}
    </>
  );
}
