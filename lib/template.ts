import crypto from "crypto";

export type LeadVars = {
  company?: string | null; state?: string | null; power_units?: number | null;
  fleet_type?: string | null; phone?: string | null; email: string;
};

export function unsubscribeToken(email: string) {
  const sig = crypto.createHmac("sha256", process.env.UNSUBSCRIBE_SECRET || "dev").update(email.toLowerCase()).digest("hex").slice(0, 24);
  return Buffer.from(`${email.toLowerCase()}|${sig}`).toString("base64url");
}
export function verifyUnsubscribeToken(token: string): string | null {
  try {
    const [email, sig] = Buffer.from(token, "base64url").toString().split("|");
    return unsubscribeToken(email) === token ? email : null;
  } catch { return null; }
}

/** Replace {{company}}, {{state}}, {{power_units}}, {{fleet_type}} in subject/body. */
export function fill(text: string, v: LeadVars) {
  const company = (v.company || "your company").replace(/\b\w+/g, (w) => w[0] + w.slice(1).toLowerCase());
  return text
    .replace(/\{\{\s*company\s*\}\}/g, company)
    .replace(/\{\{\s*state\s*\}\}/g, v.state || "")
    .replace(/\{\{\s*power_units\s*\}\}/g, v.power_units != null ? String(v.power_units) : "")
    .replace(/\{\{\s*fleet_type\s*\}\}/g, v.fleet_type || "");
}

/** Very small markdown: paragraphs, **bold**, [text](url), line breaks. Wrapped in a clean email shell. */
export function renderHtml(bodyMd: string, unsubscribeUrl: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paras = bodyMd.trim().split(/\n\s*\n/).map((p) => {
    let h = esc(p).replace(/\n/g, "<br/>");
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    h = h.replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#0E6B41">$1</a>');
    return `<p style="margin:0 0 16px 0;font-size:16px;line-height:1.55;color:#1B2431">${h}</p>`;
  }).join("");
  return `<!doctype html><html><body style="margin:0;background:#F6F7F4;font-family:Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #D9DDD6">
<tr><td style="padding:32px 36px 8px 36px">${paras}</td></tr>
<tr><td style="padding:16px 36px 28px 36px;font-size:12px;line-height:1.5;color:#5B6573;border-top:1px solid #D9DDD6">
TruckTaxPro · IRS-authorized Form 2290 e-file provider<br/>
${esc(process.env.COMPANY_POSTAL_ADDRESS || "Add your postal address in COMPANY_POSTAL_ADDRESS")}<br/>
You're receiving this because your carrier is listed in the public FMCSA registry. <a href="${unsubscribeUrl}" style="color:#5B6573">Unsubscribe</a>
</td></tr></table></td></tr></table></body></html>`;
}

export function renderText(bodyMd: string, unsubscribeUrl: string) {
  return bodyMd.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    + `\n\n—\nTruckTaxPro\nUnsubscribe: ${unsubscribeUrl}`;
}
