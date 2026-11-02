import { supabaseAdmin } from "@/lib/supabase-server";

const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

/** One line on the campaign pages: when the sender last ran and what it did, so nobody has to dig through logs. */
export async function SenderStatus() {
  const { data: s, error } = await supabaseAdmin().from("settings").select("dispatch_last_at, dispatch_last_result, dispatch_alert_key, dispatch_last_sent_at").eq("id", 1).maybeSingle();
  if (error) return <div className="panel p-3 mb-6 text-sm bg-amberSoft">Run <code>supabase/patch-017.sql</code> in Supabase to see what the sender is doing.</div>;
  if (!s?.dispatch_last_at) return <div className="panel p-3 mb-6 text-sm text-muted">Sender: no run recorded yet. It runs every 5 minutes.</div>;
  const late = Date.now() - new Date(s.dispatch_last_at).getTime() > 30 * 60000;
  const bad = late || (s.dispatch_alert_key && s.dispatch_alert_key !== "hold");
  return (
    <div className={`panel p-3 mb-6 text-sm ${bad ? "bg-brickSoft" : "bg-signSoft"}`}>
      <strong>Sender</strong> ran {ago(s.dispatch_last_at)}: {s.dispatch_last_result}
      {s.dispatch_last_sent_at && <span className="text-muted"> · last email sent {ago(s.dispatch_last_sent_at)}</span>}
      {late && <span className="text-brick font-medium"> · It should run every 5 minutes. Check Vercel, Cron Jobs.</span>}
    </div>
  );
}
