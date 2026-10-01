import { supabaseAdmin } from "./supabase-server";

export const MONTHS = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];
export const tyLabel = (y: number) => `TY${y}-${String(y + 1).slice(2)}`;

/** Months of a tax year as yyyy-mm-01 strings, Jul..Jun. */
export function tyMonths(taxYear: number) {
  return MONTHS.map((_, i) => { const y = i < 6 ? taxYear : taxYear + 1; const m = (i < 6 ? 7 + i : i - 5); return `${y}-${String(m).padStart(2, "0")}-01`; });
}

export async function activeTaxYear() {
  const sb = supabaseAdmin();
  const { data } = await sb.from("ttp_tax_periods").select("tax_year").eq("is_active", true).order("tax_year", { ascending: false }).limit(1).maybeSingle();
  if (data?.tax_year) return data.tax_year as number;
  const now = new Date(); return now.getMonth() + 1 >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

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

export const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
