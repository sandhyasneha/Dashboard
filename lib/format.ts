export const n = (v: number | null | undefined) => new Intl.NumberFormat("en-US").format(v ?? 0);
export const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "—");
export const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
export const titleCase = (s?: string | null) => (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
