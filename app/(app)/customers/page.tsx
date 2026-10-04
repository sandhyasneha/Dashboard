import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { Pager } from "@/components/Pager";
import { n, when } from "@/lib/format";

export const dynamic = "force-dynamic";
const PAGE = 50;

export default async function Customers({ searchParams }: { searchParams: { q?: string; p?: string } }) {
  const sb = supabaseAdmin();
  const q = (searchParams.q ?? "").slice(0, 60); const term = q.replace(/[,()*%\\"']/g, " ").trim();
  const page = Math.max(1, Math.floor(Number(searchParams.p)) || 1);
  let list = sb.from("leads").select("*", { count: "exact" }).eq("is_customer", true);
  if (term) list = list.or(`email.ilike.*${term}*,phone.ilike.*${term}*`);
  const head = { count: "exact" as const, head: true };
  const [{ data, count }, { count: all }, { count: filed }] = await Promise.all([
    list.order("updated_at", { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1),
    sb.from("leads").select("id", head).eq("is_customer", true),
    sb.from("leads").select("id", head).not("customer_filed_at", "is", null),
  ]);
  return (
    <>
      <PageHeader title="Converted leads" sub="Contacts from your lists who registered or filed on trucktaxpro.com. Prospect sequences stop the moment it happens." />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="Returning customers" value={all ?? 0} tone="sign" />
        <Stat label="Filed a return" value={filed ?? 0} tone="sign" />
        <Stat label="Registered only" value={(all ?? 0) - (filed ?? 0)} tone="amber" sub="Worth a nudge to finish filing" />
      </div>
      {all ? (
        <div className="panel overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Customers</h2>
            <form action="/customers" className="flex items-center gap-2"><input className="input h-9 w-64" name="q" placeholder="Search email or phone" defaultValue={q} /><button className="btn-secondary h-9">Search</button>{q && <Link href="/customers" className="text-sm text-sign font-medium hover:underline">Clear</Link>}</form>
          </div>
          {data?.length ? (
            <div className="table-scroll"><table className="table">
              <thead><tr><th>Email</th><th>Phone</th><th>Registered</th><th>Filed</th></tr></thead>
              <tbody>{data.map((l) => (<tr key={l.id}><td className="font-medium">{l.email}</td><td className="text-muted whitespace-nowrap">{l.phone ?? "—"}</td><td className="text-muted whitespace-nowrap">{when(l.customer_registered_at)}</td><td className={`whitespace-nowrap ${l.customer_filed_at ? "text-sign font-medium" : "text-muted"}`}>{when(l.customer_filed_at)}</td></tr>))}</tbody>
            </table></div>
          ) : <p className="px-5 py-10 text-sm text-muted text-center">No customers match that search.</p>}
          <Pager path="/customers" params={{ q: q || undefined }} page={page} pageSize={PAGE} total={count ?? 0} />
        </div>
      ) : <Empty title="No conversions yet" body="Once the daily sync runs on the server, any contact whose email appears in UserMaster shows up here." />}
    </>
  );
}
