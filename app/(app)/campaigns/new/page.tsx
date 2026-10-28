import { PageHeader } from "@/components/ui";
import { CampaignBuilder, type CopyFrom } from "@/components/CampaignBuilder";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

/** "Batch 3" for a name ending in "batch 2", otherwise "· batch 2" is added. */
const nextName = (name: string) => {
  const m = name.match(/^(.*?)[\s·-]*batch\s*(\d+)\s*$/i);
  return m ? `${m[1]} · batch ${Number(m[2]) + 1}` : `${name} · batch 2`;
};

export default async function NewCampaign({ searchParams }: { searchParams: { from?: string } }) {
  const sb = supabaseAdmin();
  // ?from=<campaign id>: start from a copy of that campaign's emails and settings (Copy into a new campaign).
  let copy: CopyFrom | undefined;
  if (searchParams.from && /^[0-9a-f-]{36}$/i.test(searchParams.from)) {
    const [{ data: c }, { data: st }, { data: stats }] = await Promise.all([
      sb.from("campaigns").select("name, daily_cap, filter_carrier_types, kind").eq("id", searchParams.from).maybeSingle(),
      sb.from("campaign_steps").select("subject, body_md, delay_days").eq("campaign_id", searchParams.from).order("position"),
      sb.from("campaign_stats").select("enrolled").eq("campaign_id", searchParams.from).maybeSingle(),
    ]);
    if (c && st?.length && c.kind === "prospect")
      copy = { name: nextName(c.name), from: c.name, cap: c.daily_cap, types: c.filter_carrier_types ?? [], limit: stats?.enrolled ? Number(stats.enrolled) : null,
        steps: st.map((s: any) => ({ subject: s.subject, body_md: s.body_md, delay_days: s.delay_days })) };
  }
  // Two sets of counts: skipping contacts already emailed (the default), and including them.
  const [skip, all] = await Promise.all([sb.rpc("lead_facets", { p_skip_emailed: true }), sb.rpc("lead_facets", { p_skip_emailed: false })]);
  const read = (data: unknown) => {
    const byType: Record<string, number> = {}; let total = 0;
    for (const r of (data ?? []) as { kind: string; label: string; n: number }[]) { if (r.kind === "type") byType[r.label] = r.n; else if (r.kind === "total") total = r.n; }
    return { byType, total };
  };
  const fresh = read(skip.data), everyone = read(all.data);
  const { data: mine } = await sb.from("email_templates").select("id, name, description, steps").order("name");
  const missing = !!skip.error;
  return (
    <>
      <PageHeader title="New campaign" sub="Only contacts marked new are enrolled, so nobody is in two sequences at once. Customers who have already registered are handled by Retention." />
      {copy && <div className="panel p-4 mb-6 bg-signSoft text-sm">Copied from <strong>{copy.from}</strong>: the same emails, follow-up days, lists and daily limit. Only the first is set to the same number as before. Contacts already emailed are skipped, so this reaches the next batch. Check the name, then Save draft.</div>}
      {missing && <div className="panel p-4 mb-6 bg-amberSoft text-sm">Run <code>supabase/patch-014.sql</code> in Supabase, then reload. It adds Skip contacts who were already emailed.</div>}
      <CampaignBuilder key={copy ? searchParams.from : "new"} fresh={fresh} everyone={everyone} copy={copy} saved={(mine ?? []) as any} />
    </>
  );
}
