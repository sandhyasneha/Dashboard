import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, StatusPill, Empty } from "@/components/ui";
import { n, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Leads({ searchParams }: { searchParams: { q?: string; state?: string; status?: string; p?: string } }) {
  const sb = supabaseAdmin();
  const p = Math.max(1, Number(searchParams.p ?? 1));
  let q = sb.from("leads").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((p - 1) * PAGE, p * PAGE - 1);
  if (searchParams.q) q = q.or(`email.ilike.%${searchParams.q}%,company_name.ilike.%${searchParams.q}%`);
  if (searchParams.state) q = q.eq("state", searchParams.state);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const { data, count } = await q;
  const total = count ?? 0;
  const link = (over: Record<string, string | number>) => { const u = new URLSearchParams({ ...searchParams, ...over } as any); return `/leads?${u}`; };

  return (
    <>
      <PageHeader title="Leads" sub={`${n(total)} carriers match`} action={<Link href="/leads/import" className="btn-primary">Import a file</Link>} />
      <form className="flex gap-3 mb-5" action="/leads">
        <input className="input max-w-xs" name="q" placeholder="Search email or company" defaultValue={searchParams.q} />
        <select className="input w-40" name="state" defaultValue={searchParams.state ?? ""}>
          <option value="">All states</option>{["TX", "CA", "IL", "OH", "GA", "IN"].map((s) => <option key={s}>{s}</option>)}
        </select>
        <select className="input w-44" name="status" defaultValue={searchParams.status ?? ""}>
          <option value="">Any status</option>{["new", "in_sequence", "customer", "bounced", "unsubscribed", "complained"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data?.length ? (
        <div className="panel overflow-hidden">
          <table className="table">
            <thead><tr><th>Company</th><th>Email</th><th>Phone</th><th>State</th><th className="text-right">Units</th><th>Fleet</th><th>Status</th></tr></thead>
            <tbody>{data.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{titleCase(l.company_name) || "—"}</td><td className="text-muted">{l.email}</td><td className="text-muted whitespace-nowrap">{l.phone ?? "—"}</td>
                <td>{l.state ?? "—"}</td><td className="text-right">{l.power_units ?? "—"}</td><td className="text-muted">{l.carrier_type ?? "—"}</td><td><StatusPill status={l.status} /></td>
              </tr>))}</tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm text-muted">
            <span>Page {p} of {Math.max(1, Math.ceil(total / PAGE))}</span>
            <span className="flex gap-2">{p > 1 && <Link className="btn-secondary h-8" href={link({ p: p - 1 })}>Previous</Link>}{p * PAGE < total && <Link className="btn-secondary h-8" href={link({ p: p + 1 })}>Next</Link>}</span>
          </div>
        </div>
      ) : <Empty title="No leads yet" body="Import the FMCSA lead files one at a time. Duplicates are merged by email, and suppressed addresses are skipped automatically." cta="Import a file" href="/leads/import" />}
    </>
  );
}
