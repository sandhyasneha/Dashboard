import { supabaseAdmin } from "./supabase-server";
import { centralMonth, centralYear } from "./schedule";

export const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
export const tyLabel = (y: number) => `TY${y}-${String(y + 1).slice(2)}`;

/** Months of a tax year as yyyy-mm-01 strings, Jul..Jun. */
export function tyMonths(taxYear: number) {
  return MONTHS.map((_, i) => { const y = i < 6 ? taxYear : taxYear + 1; const m = (i < 6 ? 7 + i : i - 5); return `${y}-${String(m).padStart(2, "0")}-01`; });
}

/** The first tax year this platform has data for. Earlier years are not shown. Override with FIRST_TAX_YEAR in Vercel. */
export const FIRST_TAX_YEAR = Number(process.env.FIRST_TAX_YEAR ?? 2026);

/** Tax years run 1 July to 30 June, so July 2026 to June 2027 is TY2026-27. Follows the calendar (Central time). */
export function currentTaxYear(now = new Date()) { return centralMonth(now) >= 7 ? centralYear(now) : centralYear(now) - 1; }

/** Years to offer: from the first year up to the one after the current year, so next season appears by itself. */
export function taxYearChoices(now = new Date()) {
  const cur = Math.max(FIRST_TAX_YEAR, currentTaxYear(now));
  const out: number[] = []; for (let y = FIRST_TAX_YEAR; y <= cur + 1; y++) out.push(y); return out;
}

export async function activeTaxYear() { return Math.max(FIRST_TAX_YEAR, currentTaxYear()); }

export type MonthRow = { month: string; filed: number; revenue: number; vehicles: number };

/** Series aligned to the tax-year months, zero-filled. */
export async function filingsSeries(taxYear: number) {
  const sb = supabaseAdmin();
  const { data } = await sb.rpc("dash_filings_by_month", { p_tax_year: taxYear });
  const byMonth = new Map<string, MonthRow>((data ?? []).map((r: MonthRow) => [String(r.month).slice(0, 10), r]));
  return tyMonths(taxYear).map((m, i) => ({ month: MONTHS[i], key: m, filed: byMonth.get(m)?.filed ?? 0, revenue: Number(byMonth.get(m)?.revenue ?? 0), vehicles: byMonth.get(m)?.vehicles ?? 0 }));
}

export async function usersSeries() {
  const sb = supabaseAdmin();
  const { data } = await sb.rpc("dash_users_by_month");
  return (data ?? []) as { month: string; registered: number }[];
}

export async function lastSync() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data;
}

export const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** Campaigns with their stats attached as campaign_stats[0]. Separate queries because a view can't be embedded. */
export async function campaignsWithStats(opts: { status?: string; limit?: number } = {}) {
  const sb = supabaseAdmin();
  let q = sb.from("campaigns").select("*").order("created_at", { ascending: false });
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.limit) q = q.limit(opts.limit);
  const { data } = await q;
  const ids = (data ?? []).map((c: any) => c.id);
  const { data: stats } = ids.length ? await sb.from("campaign_stats").select("*").in("campaign_id", ids) : { data: [] as any[] };
  const byId = new Map<string, any>((stats ?? []).map((x: any) => [x.campaign_id, x]));
  return (data ?? []).map((c: any) => ({ ...c, campaign_stats: byId.has(c.id) ? [byId.get(c.id)] : [] }));
}

/** The full lapsed list, paged because Supabase caps a response at 1,000 rows. */
export async function fetchLapsed(prev: number, curr: number) {
  const sb = supabaseAdmin(); const out: any[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await sb.rpc("dash_lapsed", { p_prev: prev, p_curr: curr }).range(from, from + size - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

export type CohortRow = {
  email: string; name: string | null; phone: string | null; cohort_at: string; filings: number; vehicles: number; source: string;
  returned: boolean; returned_at: string | null; lead_status: string | null; in_sequence: boolean;
};

/** Everyone who filed in a tax year (optionally one calendar month), and whether they filed again the next tax year. Paged past the 1,000-row cap. */
export async function fetchCohort(taxYear: number, month: number | null): Promise<CohortRow[]> {
  const sb = supabaseAdmin(); const out: CohortRow[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data } = await sb.rpc("retention_cohort", cohortArgs(taxYear, month)).order("returned").order("cohort_at").order("email").range(from, from + size - 1);
    if (!data?.length) break;
    out.push(...(data as CohortRow[]));
    if (data.length < size) break;
  }
  return out;
}

/** A month of null is left out, because empty values cannot be sent in a GET or HEAD request. */
export const cohortArgs = (taxYear: number, month: number | null) => (month ? { p_tax_year: taxYear, p_month: month } : { p_tax_year: taxYear });

export const COHORT_PAGE = 50;

/** One page of the cohort, filtered by a search word and by filed-again status. total counts every match, not just this page. */
export async function cohortPage(taxYear: number, month: number | null, o: { q?: string; filter?: "all" | "again" | "notyet"; page?: number; size?: number }) {
  const sb = supabaseAdmin(); const size = o.size ?? COHORT_PAGE;
  const term = (o.q ?? "").replace(/[,()*%\\"']/g, " ").trim().slice(0, 60);       // characters that would break the filter syntax
  const run = async (page: number) => {
    let q = sb.rpc("retention_cohort", cohortArgs(taxYear, month), { count: "exact" });
    if (term) q = q.or(`email.ilike.*${term}*,name.ilike.*${term}*,phone.ilike.*${term}*`);
    if (o.filter === "again") q = q.eq("returned", true); else if (o.filter === "notyet") q = q.eq("returned", false);
    const { data, count, error } = await q.order("returned").order("cohort_at").order("email").range((page - 1) * size, page * size - 1);
    return { rows: (data ?? []) as CohortRow[], total: count ?? 0, error, page };
  };
  const asked = Math.floor(Number(o.page));
  const page = asked >= 1 ? asked : 1;                      // a missing or invalid page number means page 1
  let r = await run(page);
  if (!r.rows.length && page > 1) {                           // a page past the end: learn the total, then show the last page
    const first = await run(1);
    const last = Math.max(1, Math.ceil(first.total / size));
    r = last === 1 ? first : await run(Math.min(page, last));
  }
  return { ...r, size, term };
}
