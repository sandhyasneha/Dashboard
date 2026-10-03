import crypto from "crypto";
import { fill, renderEmail, renderEmailText, type LeadVars } from "./emailHtml";
import { emailOpts } from "./brand";

export { fill };
export type { LeadVars };

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

export const renderHtml = (bodyMd: string, unsubscribeUrl: string) => renderEmail(bodyMd, unsubscribeUrl, emailOpts());
export const renderText = (bodyMd: string, unsubscribeUrl: string) => renderEmailText(bodyMd, unsubscribeUrl, emailOpts());
