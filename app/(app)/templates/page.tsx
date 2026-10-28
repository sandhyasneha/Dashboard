import { PageHeader } from "@/components/ui";
import { TemplateManager, type SavedTemplate } from "@/components/TemplateManager";
import { supabaseAdmin } from "@/lib/supabase-server";
import { TEMPLATES } from "@/lib/templates";

export const dynamic = "force-dynamic";

export default async function Templates() {
  const { data, error } = await supabaseAdmin().from("email_templates").select("id, name, description, steps, updated_at, created_by").order("updated_at", { ascending: false });
  return (
    <>
      <PageHeader title="Templates" sub="Your own email sequences, ready to reuse. They appear in New campaign, under Start from a template." />
      <TemplateManager saved={(data ?? []) as SavedTemplate[]} builtIn={TEMPLATES.filter((t) => t.id !== "blank")} missing={!!error} />
    </>
  );
}
