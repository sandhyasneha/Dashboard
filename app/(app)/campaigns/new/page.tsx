import { PageHeader } from "@/components/ui";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const sb = supabaseAdmin();
  // Two sets of counts: skipping contacts already emailed (the default), and including them.
  const [skip, all] = await Promise.all([sb.rpc("lead_facets", { p_skip_emailed: true }), sb.rpc("lead_facets", { p_skip_emailed: false })]);
  const read = (data: unknown) => {
    const byType: Record<string, number> = {}; let total = 0;
    for (const r of (data ?? []) as { kind: string; label: string; n: number }[]) { if (r.kind === "type") byType[r.label] = r.n; else if (r.kind === "total") total = r.n; }
    return { byType, total };
  };
  const fresh = read(skip.data), everyone = read(all.data);
  const missing = !!skip.error;
  return (
    <>
      <PageHeader title="New campaign" sub="Only contacts marked new are enrolled, so nobody is in two sequences at once. Customers who have already registered are handled by Retention." />
      {missing && <div className="panel p-4 mb-6 bg-amberSoft text-sm">Run <code>supabase/patch-014.sql</code> in Supabase, then reload. It adds Skip contacts who were already emailed.</div>}
      <CampaignBuilder fresh={fresh} everyone={everyone} />
    </>
  );
}
