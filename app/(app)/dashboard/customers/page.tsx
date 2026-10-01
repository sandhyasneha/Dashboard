import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader, Stat } from "@/components/ui";
import { GrowthLine } from "@/components/Charts";
import { usersSeries } from "@/lib/dash";
import { n, pct, when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CustomerGrowth() {
  const sb = supabaseAdmin();
  const series = await usersSeries();
  let cum = 0;
  const data = series.map((r) => { cum += r.registered; const d = new Date(r.month); return { month: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), registered: r.registered, cumulative: cum }; });
  const head = { count: "exact" as const, head: true };
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [total, last30, filers, recent] = await Promise.all([
    sb.from("ttp_users").select("user_id", head), sb.from("ttp_users").select("user_id", head).gte("registered_at", since30),
    sb.from("ttp_filings").select("email").eq("status_id", 4),
    sb.from("ttp_users").select("name, email, phone, registered_at").order("registered_at", { ascending: false }).limit(25),
  ]);
  const uniqueFilers = new Set((filers.data ?? []).map((f: any) => f.email)).size;

  return (
    <>
      <PageHeader title="Customer growth" sub="Registrations on trucktaxpro.com, synced from UserMaster." />
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Registered users" value={total.count ?? 0} />
        <Stat label="New in last 30 days" value={last30.count ?? 0} tone="sign" />
        <Stat label="Users who completed a return" value={uniqueFilers} tone="sign" sub={pct(uniqueFilers, total.count ?? 0) + " of users"} />
      </div>
      <section className="panel p-5 mb-6"><h2 className="font-semibold mb-3">Registrations by month</h2>{data.length ? <GrowthLine data={data} /> : <p className="text-sm text-muted py-10 text-center">No user data yet — run the sync.</p>}</section>
      <section className="panel"><div className="px-5 py-4 border-b border-line"><h2 className="font-semibold">Latest registrations</h2></div>
        <table className="table"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Registered</th></tr></thead>
          <tbody>{(recent.data ?? []).map((u: any) => <tr key={u.email}><td className="font-medium">{u.name ?? "—"}</td><td className="text-muted">{u.email}</td><td className="text-muted">{u.phone ?? "—"}</td><td className="text-muted">{when(u.registered_at)}</td></tr>)}</tbody></table>
        {!recent.data?.length && <p className="px-5 py-8 text-sm text-muted">Nothing synced yet.</p>}</section>
    </>
  );
}
