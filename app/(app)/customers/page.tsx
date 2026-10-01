import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { n, when, titleCase } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Customers() {
  const sb = supabaseAdmin();
  const [{ data, count }, { count: filed }] = await Promise.all([
    sb.from("leads").select("*", { count: "exact" }).eq("is_customer", true).order("updated_at", { ascending: false }).limit(200),
    sb.from("leads").select("id", { count: "exact", head: true }).not("customer_filed_at", "is", null),
  ]);
  return (
    <>
      <PageHeader title="Converted leads" sub="Leads from your campaign files who registered or filed on trucktaxpro.com. Prospect sequences stop the moment it happens." />
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Stat label="Returning customers" value={count ?? 0} tone="sign" />
        <Stat label="Filed a return" value={filed ?? 0} tone="sign" />
        <Stat label="Registered only" value={(count ?? 0) - (filed ?? 0)} tone="amber" sub="Worth a nudge to finish filing" />
      </div>
      {data?.length ? (
        <div className="panel overflow-hidden"><table className="table">
          <thead><tr><th>Company</th><th>Email</th><th>State</th><th>Registered</th><th>Filed</th></tr></thead>
          <tbody>{data.map((l) => (<tr key={l.id}><td className="font-medium">{titleCase(l.company_name) || "—"}</td><td className="text-muted">{l.email}</td><td>{l.state}</td><td className="text-muted">{when(l.customer_registered_at)}</td><td className={l.customer_filed_at ? "text-sign font-medium" : "text-muted"}>{when(l.customer_filed_at)}</td></tr>))}</tbody>
        </table></div>
      ) : <Empty title="No conversions yet" body="Once the hourly sync runs on the server, any lead whose email appears in UserMaster shows up here." />}
    </>
  );
}
