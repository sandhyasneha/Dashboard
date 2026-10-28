// Pure (no server imports): used by the template editor and the campaign builder to give inbox tips while you type.

/** The short version, shown above every template and email editor. */
export const INBOX_TIPS = [
  "Write it like a short personal note: plain text, a few short paragraphs, \"Hi there\".",
  "Keep the subject plain and honest. No price, no $ sign, no ALL CAPS, no \"!!\", and never \"Re:\" or \"Fwd:\" on a first message.",
  "Use one link, typed as a plain address (https://trucktaxpro.com). A button looks more like an ad.",
  "No images, attachments or emojis. The footer with the address and Unsubscribe link is added for you.",
  "Put the offer in the body, in plain words, and only claims that are true.",
];

const HYPE = /\b(free|guaranteed|act now|limited time|urgent|winner|cheapest|lowest price|100%|risk[- ]free|click here|buy now|best price|industry[- ]shattering)\b/i;

/** Gentle warnings for one email. Nothing is blocked: they are tips for landing in the inbox. */
export function inboxWarnings(subject: string, body: string): string[] {
  const out: string[] = [];
  const s = subject.trim(), b = body.trim();
  if (/^(re|fwd?)\s*:/i.test(s)) out.push("The subject starts with Re: or Fwd:. Only use that on a real reply; otherwise it misleads, which anti-spam law (CAN-SPAM) forbids.");
  if (/[$€£]|\d+\s*%/.test(s)) out.push("The subject has a price or a percentage. Gmail tends to file that under Promotions. Move it to the body.");
  if ((s.match(/!/g) ?? []).length >= 2) out.push("Too many exclamation marks in the subject.");
  if (s.length > 8 && s.replace(/[^A-Za-z]/g, "").length > 6 && s === s.toUpperCase()) out.push("The subject is in capitals. Use normal case.");
  if (s.length > 70) out.push("The subject is long. Under 50 characters reads best on a phone.");
  if (HYPE.test(s) || HYPE.test(b)) out.push(`"${(HYPE.exec(s) ?? HYPE.exec(b))![0]}" sounds like an ad and can push the email into Promotions or spam.`);
  const links = (b.match(/\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]+|\bwww\.\S+/g) ?? []).length;
  if (links > 2) out.push(`${links} links. One, or at most two, keeps it looking like a personal note.`);
  if (/!\[|<img|<table|<div|<style/i.test(b)) out.push("Images or HTML code in the body. Keep it to plain text; the email design is added for you.");
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(s + b)) out.push("Emojis look promotional. Leave them out.");
  if (b && b.split(/\s+/).length > 220) out.push("The body is long. 60 to 150 words works best.");
  if (/reply (to this|here)|just reply|reply to (the|my) (email|note)/i.test(b)) out.push("It asks people to reply to this email, but replies are not read. Ask them to email info@trucktaxpro.com instead.");
  if (b && !/\bhi\b|\bhello\b|\bdear\b/i.test(b.slice(0, 40))) out.push("Start with a greeting such as \"Hi there,\" so it reads like a note.");
  return out;
}
