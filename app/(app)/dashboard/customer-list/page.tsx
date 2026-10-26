import Link from "next/link";
import { PageHeader, Stat, Empty } from "@/components/ui";
import { Pager } from "@/components/Pager";
import { RetentionImport } from "@/components/RetentionImport";
import { ReminderPanel } from "@/components/ReminderPanel";
import { supabaseAdmin } from "@/lib/supabase-server";
import { activeTaxYear } from "@/lib/dash";
import { loadReminderConfig, openReminderCampaign } from "@/lib/reminders";
import { customerPage, customerSummary, filterParams, readFilters } from "@/lib/customers";
import { MONTH_SHORT, SEASON, SOURCES, STATUSES, monthsText, tyText } from "@/lib/customerFields";
import { n, when } from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  "Filed & paid": "bg-signSoft text-sign", "Started, not paid": "bg-amberSoft text-amber",
  "Registered only": "bg-slate text-ink", "Filed (imported)": "bg-slate text-muted",
};

export default async function CustomerList({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const f = readFilters(searchParams);
  const sb = supabaseAdmin(); const ty = await activeTaxYear();
  const [sum, list, settings, campReg, campUnpaid] = await Promise.all([
    customerSummary(), customerPage(f, Number(searchParams.p)),
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    openReminderCampaign("registered", ty), openReminderCampaign("unpaid", ty),
  ]);
  const waiting = async (id?: string) => id ? ((await sb.from("enrollments").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "active")).count ?? 0) : 0;
  const [waitReg, waitUnpaid] = await Promise.all([waiting(campReg?.id), waiting(campUnpaid?.id)]);
  const st = settings.data as any;
  const remindersMissing = !st || !("reminders" in st);
  const params = filterParams(f);
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  const filtered = !!(f.q || f.status || f.source || f.ty || f.m);
  const notSetUp = !!sum.error;

  return (
    <>
      <PageHeader title="Customers" sub="Everyone who registered or filed on trucktaxpro.com, plus past filers you imported. Updates with every daily sync. Times are Central."
        action={<a className="btn-secondary" href={`/api/customers/export${qs ? "?" + qs : ""}`}>Export CSV</a>} />
      {notSetUp && <div className="panel p-4 mb-6 bg-amberSoft text-sm">This page needs one database update. Run <code>supabase/patch-011.sql</code> in the Supabase SQL editor, then reload.</div>}

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label="Customers" value={sum.total} sub={`${n(sum.source("Existing lead"))} from your contact list · ${n(sum.source("New"))} new`} />
        <Stat label="Filed & paid" value={sum.status("Filed & paid")} tone="sign" sub="in their latest tax year" />
        <Stat label="Started, not paid" value={sum.status("Started, not paid")} tone="amber" sub="Worth a reminder to finish" />
        <Stat label="Registered only" value={sum.status("Registered only")} sub="No return started yet" />
      </div>

      <section className="panel overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-line">
          <form action="/dashboard/customer-list" className="flex flex-wrap items-center gap-2">
            <input className="input h-9 !w-64" name="q" placeholder="Search name, company, email or phone" defaultValue={f.q} />
            <select className="input h-9 !w-44" name="status" defaultValue={f.status ?? ""}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s} ({n(sum.status(s))})</option>)}
            </select>
            <select className="input h-9 !w-40" name="source" defaultValue={f.source ?? ""}>
              <option value="">All sources</option>
              {SOURCES.map((s) => <option key={s} value={s}>{s} ({n(sum.source(s))})</option>)}
            </select>
            <select className="input h-9 !w-32" name="ty" defaultValue={f.ty ? String(f.ty) : ""}>
              <option value="">Any TY</option>
              {sum.years.map((y) => <option key={y} value={y}>TY {tyText(y)}</option>)}
            </select>
            <select className="input h-9 !w-40" name="m" defaultValue={f.m ? String(f.m) : ""}>
              <option value="">Any first-used month</option>
              {SEASON.map((m) => <option key={m} value={m}>{MONTH_SHORT[m - 1]}</option>)}
            </select>
            <button className="btn-secondary h-9">Search</button>
            {filtered && <Link href="/dashboard/customer-list" className="text-sm text-sign font-medium hover:underline">Clear</Link>}
          </form>
        </div>
        {list.rows.length ? (
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>Customer</th><th>Company</th><th>Phone</th><th>Registered</th><th>Status</th><th>TY</th><th>First used</th><th>Source</th></tr></thead>
              <tbody>{list.rows.map((r) => (
                <tr key={r.email}>
                  <td>{r.name ? <><div className="font-medium">{r.name}</div><div className="text-xs text-muted break-all">{r.email}</div></> : <div className="font-medium break-all">{r.email}</div>}
                    {r.suppressed && <div className="text-xs text-brick">Unsubscribed or bounced</div>}</td>
                  <td>{r.company ?? <span className="text-muted">—</span>}</td>
                  <td className="text-muted whitespace-nowrap">{r.phone ?? "—"}</td>
                  <td className="text-muted whitespace-nowrap">{when(r.registered_at)}</td>
                  <td className="whitespace-nowrap"><span className={`pill ${STATUS_TONE[r.status] ?? "bg-slate text-ink"}`}>{r.status}</span></td>
                  <td className="whitespace-nowrap">{tyText(r.tax_year) || "—"}</td>
                  <td className="whitespace-nowrap">{monthsText(r.fum_months) || "—"}</td>
                  <td className="text-muted whitespace-nowrap">{r.source}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : notSetUp ? null : sum.total ? <p className="px-5 py-10 text-sm text-muted text-center">No customers match that search.</p>
          : <div className="p-5"><Empty title="No customers yet" body="Registered users appear here after the daily sync. Past filers who are not in the system can be added with Import past filers below." /></div>}
        <Pager path="/dashboard/customer-list" params={params} page={list.page} pageSize={list.size} total={list.total} />
      </section>

      <p className="text-sm text-muted mb-6">
        <strong>TY</strong> is the customer's latest tax year with a return, and <strong>First used</strong> is the month their trucks were first used on the road in that year (from the return).
        The annual renewal for every customer is due by 31 August; a truck first used in another month is due by the end of the following month.
        <strong> Source</strong>: Existing lead = was on your contact list before signing up; New = was not; Past customer = signed up before the contact list was loaded; Imported = only in an import file.
      </p>

      <ReminderPanel initial={loadReminderConfig(st?.reminders)} campaigns={{ registered: campReg, unpaid: campUnpaid }} waiting={{ registered: waitReg, unpaid: waitUnpaid }}
        lastResult={st?.reminders_last_result ?? null} hold={st?.hold_all !== false} missing={remindersMissing} />

      <RetentionImport />
    </>
  );
}
