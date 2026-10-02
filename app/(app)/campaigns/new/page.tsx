import { PageHeader } from "@/components/ui";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const { data } = await supabaseAdmin().rpc("lead_facets");
  const byState: Record<string, number> = {}; const byType: Record<string, number> = {}; let total = 0;
  for (const r of (data ?? []) as { kind: string; label: string; n: number }[]) {
    if (r.kind === "state") byState[r.label] = r.n; else if (r.kind === "type") byType[r.label] = r.n; else total = r.n;
  }
  return (
    <>
      <PageHeader title="New campaign" sub="Only leads marked new are enrolled, so a contact is never in two sequences at once. Leads who have already registered are handled by Retention." />
      <CampaignBuilder byState={byState} byType={byType} total={total} />
    </>
  );
}
