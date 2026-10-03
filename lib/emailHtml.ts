// Pure functions (no Node-only imports) so the browser preview and the server render exactly the same email.

export type EmailOpts = {
  logoUrl: string; iconBase: string;
  phone: string; tagline: string; postalAddress: string; reason: string;
  social: { x?: string; instagram?: string; facebook?: string };
};

export type LeadVars = {
  company?: string | null; state?: string | null; power_units?: number | null;
  fleet_type?: string | null; phone?: string | null; email: string;
};

export const NAVY = "#12283d";      // from the logo
export const ORANGE = "#f5a623";    // from the logo
const FOOT = "#1b2126";             // the website footer
const FOOT_TEXT = "#9aa6ae";
const INK = "#1b2431";

/** Replace {{company}}, {{state}}, {{power_units}}, {{fleet_type}} in subject/body. */
export function fill(text: string, v: LeadVars) {
  const company = (v.company || "your company").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
  return text
    .replace(/\{\{\s*company\s*\}\}/g, company)
    .replace(/\{\{\s*state\s*\}\}/g, v.state || "")
    .replace(/\{\{\s*power_units\s*\}\}/g, v.power_units != null ? String(v.power_units) : "")
    .replace(/\{\{\s*fleet_type\s*\}\}/g, v.fleet_type || "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (t: string) =>
  esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) => `<a href="${url}" style="color:${NAVY};text-decoration:underline;font-weight:600">${text}</a>`);

const button = (text: string, url: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 26px 0"><tr><td bgcolor="${ORANGE}" style="background:${ORANGE};border-radius:6px"><a href="${esc(url)}" style="display:inline-block;padding:15px 30px;font-size:16px;font-weight:700;color:${NAVY};background:${ORANGE};text-decoration:none;border-radius:6px;font-family:Helvetica,Arial,sans-serif">${esc(text)}</a></td></tr></table>`;

/**
 * Body syntax: blank line = new paragraph; **bold**; [text](https://…);
 * a paragraph that is only one link becomes an orange button; lines starting with "- " become a list.
 */
export function renderEmail(bodyMd: string, unsubscribeUrl: string, o: EmailOpts) {
  const body = bodyMd.trim().split(/\n\s*\n/).map((p) => {
    const t = p.trim();
    const only = t.match(/^\[(.+?)\]\((https?:\/\/[^\s)]+)\)$/);
    if (only) return button(only[1], only[2]);
    const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length && lines.every((l) => /^[-*] /.test(l)))
      return `<ul style="margin:0 0 18px 0;padding-left:22px;font-size:16px;line-height:1.65;color:${INK}">${lines.map((l) => `<li style="margin-bottom:6px">${inline(l.replace(/^[-*] /, ""))}</li>`).join("")}</ul>`;
    return `<p style="margin:0 0 18px 0;font-size:16px;line-height:1.65;color:${INK}">${inline(t).replace(/\n/g, "<br/>")}</p>`;
  }).join("");

  const icons = ([["x", o.social.x, "X"], ["instagram", o.social.instagram, "Instagram"], ["facebook", o.social.facebook, "Facebook"]] as const)
    .filter((s) => s[1])
    .map((s) => `<a href="${esc(s[1]!)}" style="text-decoration:none;display:inline-block;margin-right:12px"><img src="${esc(o.iconBase)}/${s[0]}.png" width="32" height="32" alt="${s[2]}" style="display:block;border:0"></a>`)
    .join("");
  const tel = o.phone.replace(/[^\d+]/g, "");

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef1f4;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f4"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-radius:10px;overflow:hidden">
<tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:22px 32px"><img src="${esc(o.logoUrl)}" width="240" alt="TruckTaxPro" style="display:block;border:0;width:240px;max-width:100%;height:auto"></td></tr>
<tr><td height="5" bgcolor="${ORANGE}" style="background:${ORANGE};height:5px;line-height:5px;font-size:0">&nbsp;</td></tr>
<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:38px 40px 14px 40px">${body}</td></tr>
<tr><td bgcolor="${FOOT}" style="background:${FOOT};padding:30px 40px;color:${FOOT_TEXT};font-size:13px;line-height:1.6">
<div style="font-size:18px;font-weight:700;margin-bottom:16px"><a href="tel:${esc(tel)}" style="color:#e8edf1;text-decoration:none">&#9742;&nbsp; ${esc(o.phone)}</a></div>
${icons ? `<div style="margin-bottom:18px">${icons}</div>` : ""}
<div style="border-top:1px solid #2c363e;padding-top:16px;color:${FOOT_TEXT}">${esc(o.tagline)}</div>
${o.postalAddress ? `<div style="margin-top:6px">${esc(o.postalAddress)}</div>` : ""}
<div style="margin-top:12px;font-size:12px">${esc(o.reason)} <a href="${esc(unsubscribeUrl)}" style="color:${FOOT_TEXT};text-decoration:underline">Unsubscribe</a></div>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderEmailText(bodyMd: string, unsubscribeUrl: string, o: EmailOpts) {
  const text = bodyMd.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "$1: $2");
  return [text.trim(), "", "--", "TruckTaxPro", o.phone, o.postalAddress, o.reason, `Unsubscribe: ${unsubscribeUrl}`].filter((l, i) => l !== "" || i === 1).join("\n");
}
