import { PageHeader } from "@/components/ui";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const { data } = await supabaseAdmin().rpc("lead_facets");
  const byType: Record<string, number> = {}; let total = 0;
  for (const r of (data ?? []) as { kind: string; label: string; n: number }[]) {
    if (r.kind === "type") byType[r.label] = r.n; else if (r.kind === "total") total = r.n;
  }
  return (
    <>
      <PageHeader title="New campaign" sub="Only contacts marked new are enrolled, so nobody is in two sequences at once. Customers who have already registered are handled by Retention." />
      <CampaignBuilder byType={byType} total={total} />
    </>
  );
}
