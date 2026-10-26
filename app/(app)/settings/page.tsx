import { supabaseAdmin } from "@/lib/supabase-server";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "@/components/SettingsForm";
import { SyncAlertTest } from "@/components/SyncAlertTest";
import { alertRecipients, syncHealth } from "@/lib/syncAlert";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const sb = supabaseAdmin();
  const [{ data: s }, { count: sup }, health] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("suppressions").select("email", { count: "exact", head: true }),
    syncHealth(),
  ]);
  const recipients = alertRecipients();
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/webhooks/trucktaxpro`;
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-[1fr_1fr] gap-6 items-start">
        <SettingsForm dailyCap={s?.global_daily_cap ?? 700} peakCap={s?.peak_daily_cap ?? 1000} monthlyCap={s?.monthly_cap ?? 50000} />
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="font-semibold mb-2">Production data</h2>
            <p className="text-sm text-muted mb-3">The sync script on the server pushes users and filings once a day. Optionally, trucktaxpro.com can also call this the instant someone registers or files:</p>
            <pre className="text-xs bg-slate rounded-md p-3 overflow-x-auto">{`POST ${webhookUrl}
Authorization: Bearer <TTP_WEBHOOK_SECRET>
Content-Type: application/json

{ "email": "owner@carrier.com", "event": "filed" }`}</pre>
            <p className="text-sm text-muted mt-3">Use <code>"registered"</code> at sign-up and <code>"filed"</code> when a return is completed.</p>
          </section>
          <section className="panel p-6">
            <h2 className="font-semibold mb-1">Sync alerts</h2>
            <p className="text-sm text-muted mb-3">Every day at 11:30 AM Central (10:30 AM in winter), after the server&rsquo;s 6:00 AM sync, the app checks that the sync ran and succeeded. If not, it emails the addresses below, once a day until it is fixed, then once more when it works again.</p>
            <dl className="text-sm space-y-1.5">
              <div className="flex justify-between gap-4"><dt className="text-muted">Right now</dt><dd className={`font-medium text-right ${health.ok ? "text-sign" : "text-brick"}`}>{health.ok ? "Healthy" : health.problem}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Last successful sync</dt><dd className="text-right">{when(health.lastOk)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Alerts go to</dt><dd className="text-right break-all">{recipients.length ? recipients.join(", ") : <span className="text-brick">nobody: set SYNC_ALERT_EMAILS in Vercel</span>}</dd></div>
              {s && !("sync_alert_sent_at" in s) && <div className="text-amber">Run <code>supabase/patch-012.sql</code> in Supabase so alerts are sent once a day, not repeatedly.</div>}
              {s?.sync_alert_sent_at && <div className="flex justify-between gap-4"><dt className="text-muted">Alert sent</dt><dd className="text-right">{when(s.sync_alert_sent_at)}</dd></div>}
            </dl>
            <SyncAlertTest />
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
