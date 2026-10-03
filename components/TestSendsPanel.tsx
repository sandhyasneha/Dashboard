import { when } from "@/lib/format";

type Row = { id: string; to_email: string; subject: string | null; sent_at: string; delivered_at: string | null; opened_at: string | null; clicked_at: string | null; bounced_at: string | null };

/** The latest test emails and what Resend reported back. Shows at a glance whether tracking works. */
export function TestSendsPanel({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;
  const cell = (v: string | null) => (v ? <span className="text-sign font-medium">{when(v)}</span> : <span className="text-muted">—</span>);
  return (
    <section className="panel mb-8">
      <div className="px-5 py-4 border-b border-line">
        <h2 className="font-semibold">Recent test emails</h2>
        <p className="text-sm text-muted mt-1">Test emails are not counted in the numbers above. This table shows whether delivery, opens and clicks are being tracked.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>To</th><th>Subject</th><th>Sent</th><th>Delivered</th><th>Opened</th><th>Clicked</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="font-medium whitespace-nowrap">{r.to_email}</td>
              <td className="text-muted max-w-xs truncate">{r.subject}</td>
              <td className="text-muted whitespace-nowrap">{when(r.sent_at)}</td>
              <td className="whitespace-nowrap">{r.bounced_at ? <span className="text-brick font-medium">Bounced</span> : cell(r.delivered_at)}</td>
              <td className="whitespace-nowrap">{cell(r.opened_at)}</td>
              <td className="whitespace-nowrap">{cell(r.clicked_at)}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="px-5 py-3 border-t border-line text-xs text-muted">Delivered still empty after a minute: the Resend webhook is not reaching this app. Opened and Clicked empty: tracking is off for the domain in Resend. Both are explained in the KB, under Opens, clicks and tracking.</p>
    </section>
  );
}
