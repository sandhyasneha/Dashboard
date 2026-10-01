import { PageHeader } from "@/components/ui";
import { CampaignBuilder } from "@/components/CampaignBuilder";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function NewCampaign() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("leads").select("state, carrier_type").eq("status", "new").eq("is_customer", false).limit(100000);
  const byState: Record<string, number> = {}; const byType: Record<string, number> = {};
  for (const l of data ?? []) { if (l.state) byState[l.state] = (byState[l.state] ?? 0) + 1; if (l.carrier_type) byType[l.carrier_type] = (byType[l.carrier_type] ?? 0) + 1; }
  return (
    <>
      <PageHeader title="New campaign" sub="Only leads marked new are enrolled, so a carrier is never in two sequences at once." />
      <CampaignBuilder byState={byState} byType={byType} />
    </>
  );
}
