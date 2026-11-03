import type { EmailOpts, EmailStyle } from "./emailHtml";

/** plain (default), plain-link, minimal or branded. A NEXT_PUBLIC_ setting, so the builder preview, test emails and real sends always look the same. */
export const EMAIL_STYLE: EmailStyle = (["branded", "plain", "plain-link", "minimal"] as const).find((s) => s === process.env.NEXT_PUBLIC_EMAIL_STYLE) ?? "plain";

// The postal address is required by law (CAN-SPAM) in every marketing email. COMPANY_POSTAL_ADDRESS in Vercel overrides it.
export const BRAND = { phone: "+1-972-810-3393", tagline: "Made for hard-working truckers · US-based support", postalAddress: "2516 Frontera Rd, Mcallen, TX 78504" };
export const postalAddress = () => process.env.COMPANY_POSTAL_ADDRESS?.trim() || BRAND.postalAddress;

/**
 * Why the person is getting the email (footer line). It must be true for everyone on the list:
 * - customer: renewals and reminders go to people who registered or filed with TruckTaxPro.
 * - prospect: imported lists (FMCSA and others) are motor carriers who may never have used TruckTaxPro.
 */
export type Audience = "customer" | "prospect";
export const FOOTER_REASON: Record<Audience, string> = {
  customer: "You're receiving this because you've used TruckTaxPro for Form 2290 filing.",
  prospect: "You're receiving this because your company is a registered motor carrier that may need to file Form 2290.",
};
/** Renewal and reminder campaigns go to customers; every other campaign (prospect, imported lists) counts as prospects. */
export const audienceOf = (kind?: string | null): Audience => (kind === "renewal" || kind === "reminder" ? "customer" : "prospect");

/** Footer and logo settings for real sends (server only: reads settings from Vercel). */
export function emailOpts(audience: Audience = "prospect"): EmailOpts {
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    style: EMAIL_STYLE,
    logoUrl: `${app}/brand/logo.png`, iconBase: `${app}/brand`,
    phone: process.env.COMPANY_PHONE || BRAND.phone, tagline: BRAND.tagline,
    postalAddress: postalAddress(),
    reason: (audience === "customer" && process.env.EMAIL_FOOTER_REASON) || FOOTER_REASON[audience],
    social: { x: process.env.SOCIAL_X_URL, instagram: process.env.SOCIAL_INSTAGRAM_URL, facebook: process.env.SOCIAL_FACEBOOK_URL },
  };
}

/** Same look for the builder's preview, in the browser. */
export function previewOpts(origin: string, audience: Audience = "prospect"): EmailOpts {
  return {
    style: EMAIL_STYLE,
    logoUrl: `${origin}/brand/logo.png`, iconBase: `${origin}/brand`, phone: BRAND.phone, tagline: BRAND.tagline,
    postalAddress: BRAND.postalAddress, reason: FOOTER_REASON[audience],
    social: { x: "#", instagram: "#", facebook: "#" },
  };
}
