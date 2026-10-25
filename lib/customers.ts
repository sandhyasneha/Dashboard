import { supabaseAdmin } from "./supabase-server";
import { SOURCES, STATUSES } from "./customerFields";

export type CustomerRow = {
  email: string; name: string | null; company: string | null; phone: string | null; registered_at: string | null; status: string;
  tax_year: number | null; fum_months: number[] | null; source: string; paid_returns: number; last_filed_at: string | null; suppressed: boolean;
};
export type CustomerFilters = { q: string; status: string | null; source: string | null; ty: number | null; m: number | null };

/** Filters from the address bar. Anything unknown is ignored rather than trusted. */
export function readFilters(sp: Record<string, string | undefined>): CustomerFilters {
  const ty = Math.floor(Number(sp.ty)); const m = Math.floor(Number(sp.m));
  return {
    q: (sp.q ?? "").slice(0, 60),
    status: STATUSES.includes(sp.status ?? "") ? sp.status! : null,
    source: SOURCES.includes(sp.source ?? "") ? sp.source! : null,
    ty: ty >= 1990 && ty <= 2100 ? ty : null,
    m: m >= 1 && m <= 12 ? m : null,
  };
}
export const filterParams = (f: CustomerFilters): Record<string, string | undefined> => ({
  q: f.q || undefined, status: f.status ?? undefined, source: f.source ?? undefined, ty: f.ty ? String(f.ty) : undefined, m: f.m ? String(f.m) : undefined,
});

function query(f: CustomerFilters) {
  let q = supabaseAdmin().rpc("customers_list", {}, { count: "exact" });
  const term = f.q.replace(/[,()*%\\"']/g, " ").trim();                 // characters that would break the filter syntax
  if (term) q = q.or(`email.ilike.*${term}*,name.ilike.*${term}*,company.ilike.*${term}*,phone.ilike.*${term}*`);
  if (f.status) q = q.eq("status", f.status);
  if (f.source) q = q.eq("source", f.source);
  if (f.ty) q = q.eq("tax_year", f.ty);
  if (f.m) q = q.contains("fum_months", [f.m]);
  return q.order("registered_at", { ascending: false, nullsFirst: false }).order("email");
}

export const CUSTOMER_PAGE = 50;

/** One page of the list. total counts every match. A page past the end shows the last page. */
export async function customerPage(f: CustomerFilters, askedPage: number, size = CUSTOMER_PAGE) {
  const run = async (page: number) => {
    const { data, count, error } = await query(f).range((page - 1) * size, page * size - 1);
    return { rows: (data ?? []) as CustomerRow[], total: count ?? 0, error, page };
  };
  const page = Math.floor(askedPage) >= 1 ? Math.floor(askedPage) : 1;
  let r = await run(page);
  if (!r.rows.length && page > 1) {
    const last = Math.max(1, Math.ceil((await run(1)).total / size));
    r = await run(Math.min(page, last));
  }
  return { ...r, size };
}

/** Every match, read in pages of 1,000 because Supabase caps a single response at 1,000 rows. */
export async function allCustomers(f: CustomerFilters) {
  const out: CustomerRow[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await query(f).range(from, from + size - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...(data as CustomerRow[]));
    if (data.length < size) break;
  }
  return out;
}

/** Counts for the cards and the filter menus. */
export async function customerSummary() {
  const { data, error } = await supabaseAdmin().rpc("customers_summary");
  const rows = (data ?? []) as { kind: string; label: string; n: number }[];
  const get = (kind: string, label: string) => rows.find((r) => r.kind === kind && r.label === label)?.n ?? 0;
  const years = rows.filter((r) => r.kind === "ty").map((r) => Number(r.label)).sort((a, b) => b - a);
  return { error, total: get("total", "all"), status: (s: string) => get("status", s), source: (s: string) => get("source", s), years };
}
