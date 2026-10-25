// Shared by the browser (import) and the server (list and export). No server-only imports here.

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Calendar months in tax-year order, July to June. */
export const SEASON = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6];
export const STATUSES = ["Filed & paid", "Started, not paid", "Registered only", "Filed (imported)"];
export const SOURCES = ["Existing lead", "New", "Past customer", "Imported"];

/** 2026 -> "2026-27" */
export const tyText = (y?: number | null) => (y ? `${y}-${String(y + 1).slice(2)}` : "");
/** [3, 10] -> "Oct, Mar" (tax-year order) */
export const monthsText = (m?: number[] | null) =>
  [...(m ?? [])].sort((a, b) => SEASON.indexOf(a) - SEASON.indexOf(b)).map((x) => MONTH_SHORT[x - 1]).join(", ");

const TZ = "America/Chicago";
const ctParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const partsOf = (ms: number) => {
  const p = Object.fromEntries(ctParts.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute };
};
/** Central-time wall clock for a moment, as "2026-10-12 09:58" (used in the export, and read back by the import). */
export function centralStamp(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime(); if (isNaN(t)) return "";
  const p = partsOf(t); const z = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${z(p.mo)}-${z(p.d)} ${z(p.h)}:${z(p.mi)}`;
}
/** A Central-time wall clock (as typed in a file) to an exact moment, handling daylight saving. */
export function centralToIso(y: number, mo: number, d: number, h = 0, mi = 0) {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (ms: number) => { const p = partsOf(ms); return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - ms; };
  let t = wall - offset(wall);
  const again = wall - offset(t); if (again !== t) t = again;
  return new Date(t).toISOString();
}

const pad = (n: number) => String(n).padStart(2, "0");
const monthByName = (s: string) => { const i = MONTH_SHORT.findIndex((m) => s.toLowerCase().startsWith(m.toLowerCase())); return i >= 0 ? i + 1 : null; };
const validDate = (y: number, mo: number, d: number) => y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
const hour12 = (h: number, ap?: string) => (ap ? (h % 12) + (/p/i.test(ap) ? 12 : 0) : h);

/** "2026-27", "TY2026-27", "2026-2027", "2026" or 2026 -> 2026 (the tax year that starts on 1 July 2026). */
export function parseTaxYear(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(/^ty\s*/i, "");
  const m = s.match(/^(\d{4})(?:\s*[-/]\s*(\d{2}|\d{4}))?$/);
  const y = m ? Number(m[1]) : NaN;
  return y >= 1990 && y <= 2100 ? y : null;
}

type MonthPick = { month: number; year?: number };
/** A first-used month: "Oct", "October", 10, "2026-10", "202610", "10/2026", "Oct 2026", or a date. Several may be separated by commas. */
export function parseMonths(v: unknown): MonthPick[] {
  if (v instanceof Date && !isNaN(v.getTime())) return [{ month: v.getMonth() + 1, year: v.getFullYear() }];
  if (typeof v === "number") return parseOneMonth(String(v)) ? [parseOneMonth(String(v))!] : [];
  return String(v ?? "").split(/[,;&]|\band\b/i).map((x) => parseOneMonth(x.trim())).filter((x): x is MonthPick => !!x);
}
function parseOneMonth(s: string): MonthPick | null {
  if (!s) return null;
  let m = s.match(/^(\d{1,2})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return { month: +m[1] };
  m = s.match(/^(\d{4})[-/]?(\d{2})$/); if (m && +m[2] >= 1 && +m[2] <= 12) return { month: +m[2], year: +m[1] };
  m = s.match(/^(\d{1,2})[-/](\d{4})$/); if (m && +m[1] >= 1 && +m[1] <= 12) return { month: +m[1], year: +m[2] };
  m = s.match(/^([a-z]{3,9})\.?(?:[\s,'-]+(\d{4}))?$/i); if (m && monthByName(m[1])) return { month: monthByName(m[1])!, year: m[2] ? +m[2] : undefined };
  return null;
}

/** A filing date: a real date, 2027-04-15, 2027-04 (first of the month), 4/15/2027 or "Apr 15, 2027" -> "2027-04-15". */
export function parseDay(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const s = String(v ?? "").trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/); if (m && validDate(+m[1], +m[2], +(m[3] ?? 1))) return `${m[1]}-${pad(+m[2])}-${pad(+(m[3] ?? 1))}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/); if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; if (validDate(y, +m[1], +m[2])) return `${y}-${pad(+m[1])}-${pad(+m[2])}`; }
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/i); if (m && monthByName(m[1]) && validDate(+m[3], monthByName(m[1])!, +m[2])) return `${m[3]}-${pad(monthByName(m[1])!)}-${pad(+m[2])}`;
  return null;
}

/**
 * When someone registered, read as Central time: 2026-10-12 09:58, 10/12/2026 9:58 AM, "Oct 12, 2026 9:58 AM", or a date cell.
 * Without a year ("Oct 12 9:58 AM") the most recent such date is used. Returns an exact moment, or null.
 */
export function parseRegistered(v: unknown, now = new Date()): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return centralToIso(v.getFullYear(), v.getMonth() + 1, v.getDate(), v.getHours(), v.getMinutes());
  const s = String(v ?? "").trim().replace(/\s*\b(ct|cst|cdt|central)\b\.?$/i, "");
  if (!s) return null;
  const time = String.raw`(?:[ T,]+(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?)?`;
  let m = s.match(new RegExp(String.raw`^(\d{4})-(\d{1,2})-(\d{1,2})${time}$`, "i"));
  if (m && validDate(+m[1], +m[2], +m[3])) return centralToIso(+m[1], +m[2], +m[3], hour12(+(m[4] ?? 0), m[6]), +(m[5] ?? 0));
  m = s.match(new RegExp(String.raw`^(\d{1,2})/(\d{1,2})/(\d{2}|\d{4})${time}$`, "i"));
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; if (validDate(y, +m[1], +m[2])) return centralToIso(y, +m[1], +m[2], hour12(+(m[4] ?? 0), m[6]), +(m[5] ?? 0)); }
  m = s.match(new RegExp(String.raw`^([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?${time}$`, "i"));
  if (m && monthByName(m[1])) {
    const mo = monthByName(m[1])!, d = +m[2];
    let y = m[3] ? +m[3] : now.getFullYear();
    if (!m[3] && Date.UTC(y, mo - 1, d) > now.getTime()) y -= 1;          // no year written: the most recent one
    if (validDate(y, mo, d)) return centralToIso(y, mo, d, hour12(+(m[4] ?? 0), m[6]), +(m[5] ?? 0));
  }
  return null;
}

/** Column names the import recognises (lower case). The export uses the first name in each list, so an export can be imported back. */
export const COLUMNS = {
  name: ["customer name", "name", "customer", "full name", "contact name"],
  company: ["company", "company name", "business name", "business", "legal name"],
  email: ["email", "email address", "e-mail", "contact email", "email_address"],
  phone: ["phone", "phone number", "mobile", "contact phone", "telephone"],
  registered: ["registered (central)", "registered", "registered on", "registered date", "registration date", "signed up"],
  ty: ["ty", "tax year", "taxyear", "tax period"],
  month: ["first used month", "month", "first used", "fum", "first-used month", "first used months", "first used month(s)"],
  filed: ["filed on", "filed", "filed date", "filing date", "date", "filed month"],
} as const;
export const TEMPLATE_HEADERS = ["Customer name", "Company", "Email", "Phone", "Registered (Central)", "TY", "First used month", "Filed on"];

export type ImportRow = { email: string; filed_on: string; name: string | null; company: string | null; phone: string | null; registered_at: string | null; first_used_month: number | null };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cleanText = (v: unknown, max: number) => { const s = String(v ?? "").trim(); return s ? s.slice(0, max) : null; };

/**
 * One spreadsheet row -> the filings to save. Needs an Email, and either a Filed on date, or a TY and a First used month.
 * Several months in one cell ("Oct, Mar") give one filing per month. Returns the reason when the row cannot be used.
 */
export function readImportRow(r: Record<string, unknown>): { rows: ImportRow[] } | { error: string } {
  const pick = (keys: readonly string[]) => { const k = Object.keys(r).find((x) => keys.includes(x.trim().toLowerCase())); return k === undefined ? undefined : r[k]; };
  const email = String(pick(COLUMNS.email) ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "no valid email" };
  const base = {
    email, name: cleanText(pick(COLUMNS.name), 120), company: cleanText(pick(COLUMNS.company), 200),
    phone: cleanText(pick(COLUMNS.phone), 40), registered_at: parseRegistered(pick(COLUMNS.registered)),
  };
  const ty = parseTaxYear(pick(COLUMNS.ty));
  const months = parseMonths(pick(COLUMNS.month));
  const filed = parseDay(pick(COLUMNS.filed));
  if (filed) return { rows: [{ ...base, filed_on: filed, first_used_month: months[0]?.month ?? null }] };
  if (!months.length) return { error: "no Filed on date, and no First used month" };
  const rows: ImportRow[] = [];
  for (const m of months) {
    const year = m.year ?? (ty ? (m.month >= 7 ? ty : ty + 1) : null);
    if (!year) return { error: "a First used month without a TY" };
    rows.push({ ...base, filed_on: `${year}-${pad(m.month)}-01`, first_used_month: m.month });
  }
  return { rows };
}
