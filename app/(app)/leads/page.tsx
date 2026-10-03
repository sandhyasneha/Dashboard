import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, StatusPill, Empty } from "@/components/ui";
import { n } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Leads({ searchParams }: { searchParams: { q?: string; list?: string; status?: string; p?: string } }) {
  const sb = supabaseAdmin();
  const p = Math.max(1, Number(searchParams.p ?? 1));
  let q = sb.from("leads").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((p - 1) * PAGE, p * PAGE - 1);
  if (searchParams.q) q = q.ilike("email", `%${searchParams.q}%`);
  if (searchParams.list) q = q.eq("carrier_type", searchParams.list);
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const [{ data, count }, { data: facets }] = await Promise.all([q, sb.rpc("lead_facets")]);
  const lists = ((facets ?? []) as { kind: string; label: string }[]).filter((f) => f.kind === "type").map((f) => f.label);
  if (searchParams.list && !lists.includes(searchParams.list)) lists.push(searchParams.list);
  const total = count ?? 0;
  const link = (over: Record<string, string | number>) => { const u = new URLSearchParams({ ...searchParams, ...over } as any); return `/leads?${u}`; };

  return (
    <>
      <PageHeader title="Leads" sub={`${n(total)} contacts match`} action={<Link href="/leads/import" className="btn-primary">Import a file</Link>} />
      <form className="flex gap-3 mb-5" action="/leads">
        <input className="input max-w-xs" name="q" placeholder="Search by email" defaultValue={searchParams.q} />
        <select className="input w-48" name="list" defaultValue={searchParams.list ?? ""}>
          <option value="">All lists</option>{lists.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="input w-44" name="status" defaultValue={searchParams.status ?? ""}>
          <option value="">Any status</option>{["new", "in_sequence", "customer", "bounced", "unsubscribed", "complained"].map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <button className="btn-secondary">Filter</button>
      </form>
      {data?.length ? (
        <div className="panel overflow-hidden">
          <table className="table">
            <thead><tr><th>Email</th><th>Phone</th><th>List</th><th>Status</th></tr></thead>
            <tbody>{data.map((l) => (
              <tr key={l.id}>
                <td className="font-medium">{l.email}</td><td className="text-muted whitespace-nowrap">{l.phone ?? "—"}</td>
                <td className="text-muted">{l.carrier_type ?? "—"}</td><td><StatusPill status={l.status} /></td>
              </tr>))}</tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm text-muted">
            <span>Page {p} of {Math.max(1, Math.ceil(total / PAGE))}</span>
            <span className="flex gap-2">{p > 1 && <Link className="btn-secondary h-8" href={link({ p: p - 1 })}>Previous</Link>}{p * PAGE < total && <Link className="btn-secondary h-8" href={link({ p: p + 1 })}>Next</Link>}</span>
          </div>
        </div>
      ) : <Empty title="No leads yet" body="Import a file with an email column. Duplicates are merged by email, and suppressed addresses are skipped automatically." cta="Import a file" href="/leads/import" />}
    </>
  );
}
