import type { EmailOpts, EmailStyle } from "./emailHtml";

/** plain (default), plain-link or branded. A NEXT_PUBLIC_ setting, so the builder preview, test emails and real sends always look the same. */
export const EMAIL_STYLE: EmailStyle = (["branded", "plain", "plain-link"] as const).find((s) => s === process.env.NEXT_PUBLIC_EMAIL_STYLE) ?? "plain";

export const BRAND = { phone: "+1-972-810-3393", tagline: "Made for hard-working truckers · US-based support" };

/** Footer and logo settings for real sends (server only: reads settings from Vercel). */
export function emailOpts(): EmailOpts {
  const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return {
    style: EMAIL_STYLE,
    logoUrl: `${app}/brand/logo.png`, iconBase: `${app}/brand`,
    phone: process.env.COMPANY_PHONE || BRAND.phone, tagline: BRAND.tagline,
    postalAddress: process.env.COMPANY_POSTAL_ADDRESS || "",
    reason: process.env.EMAIL_FOOTER_REASON || "You're receiving this because you've used TruckTaxPro for Form 2290 filing.",
    social: { x: process.env.SOCIAL_X_URL, instagram: process.env.SOCIAL_INSTAGRAM_URL, facebook: process.env.SOCIAL_FACEBOOK_URL },
  };
}

/** Same look for the builder's preview, in the browser. */
export function previewOpts(origin: string): EmailOpts {
  return {
    style: EMAIL_STYLE,
    logoUrl: `${origin}/brand/logo.png`, iconBase: `${origin}/brand`, phone: BRAND.phone, tagline: BRAND.tagline,
    postalAddress: "Your postal address appears here", reason: "You're receiving this because you've used TruckTaxPro for Form 2290 filing.",
    social: { x: "#", instagram: "#", facebook: "#" },
  };
}
