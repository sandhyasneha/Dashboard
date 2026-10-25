export const n = (v: number | null | undefined) => new Intl.NumberFormat("en-US").format(v ?? 0);
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
// Times and dates are shown in Central time (where customers and the sending window are), marked CT, whatever the server's clock is.
export const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) + " CT" : "—";
export const titleCase = (s?: string | null) => (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const day = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric" }) : "—";
