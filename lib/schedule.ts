// Shared by the browser and the server. Sending is allowed Monday to Friday, 9:00 to 16:59 Central.
const TZ = "America/Chicago";
const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", hour12: false });

export function windowOpen(d: Date) {
  const p = parts.formatToParts(d);
  const wd = p.find((x) => x.type === "weekday")?.value ?? "";
  const h = Number(p.find((x) => x.type === "hour")?.value ?? 0) % 24;
  return wd !== "Sat" && wd !== "Sun" && h >= 9 && h < 17;
}

/** The first quarter-hour at or after `from` when sending is allowed. */
export function nextOpening(from: Date) {
  let t = Math.ceil(from.getTime() / 900000) * 900000;
  for (let i = 0; i < 800 && !windowOpen(new Date(t)); i++) t += 900000;
  return new Date(t);
}

export const centralLabel = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " Central";
