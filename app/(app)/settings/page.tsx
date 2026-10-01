import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const sb = supabaseAdmin();
  const [{ data: s }, { count: sup }] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("suppressions").select("email", { count: "exact", head: true }),
  ]);
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/trucktaxpro`;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">
        <SettingsForm dailyCap={s?.global_daily_cap ?? 800} monthlyCap={s?.monthly_cap ?? 20000} />
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-semibold mb-2">Production data</h2>
            <p className="text-sm text-muted mb-3">The sync script on the server pushes users and filings every hour. Optionally, trucktaxpro.com can also call this the instant someone registers or files:</p>
            <pre className="text-xs bg-slate rounded-md p-3 overflow-x-auto">{`POST ${webhookUrl}
Authorization: Bearer <TTP_WEBHOOK_SECRET>
Content-Type: application/json

{ "email": "owner@carrier.com", "event": "filed" }`}</pre>
            <p className="text-sm text-muted mt-3">Use <code>"registered"</code> at sign-up and <code>"filed"</code> when a return is completed.</p>
          </section>
          <section className="panel p-6">
            <h2 className="font-semibold mb-1">Suppression list</h2>
            <p className="text-sm text-muted">{(sup ?? 0).toLocaleString()} addresses will never be emailed: unsubscribes, bounces, and complaints. Imports skip them automatically.</p>
          </section>
        </div>
      </div>
    </>
  );
}
