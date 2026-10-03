import { Resend } from "resend";
export const resend = new Resend(process.env.RESEND_API_KEY);

export type OutboundEmail = {
  to: string; subject: string; html: string; text: string; unsubscribeUrl: string;
  tags?: { name: string; value: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Resend limits API requests per second for the whole account and answers HTTP 429 when it is exceeded.
const isRateLimit = (e: any) => e?.name === "rate_limit_exceeded" || /rate.?limit|too many requests/i.test(String(e?.message ?? ""));

function toPayload(emails: OutboundEmail[]) {
  const from = process.env.EMAIL_FROM!;
  const replyTo = process.env.EMAIL_REPLY_TO;
  return emails.map((e) => ({
    from, to: [e.to], subject: e.subject, html: e.html, text: e.text,
    reply_to: replyTo,
    headers: { "List-Unsubscribe": `<${e.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: e.tags,
  }));
}

/**
 * Sends up to 100 emails in ONE Resend request (the batch call counts as a single request against the rate limit).
 * If Resend says "rate limited" it waits and retries. Returns an id per email (null if not accepted) and the error, if any.
 */
export async function sendBatchStrict(emails: OutboundEmail[]): Promise<{ ids: (string | null)[]; error: string | null }> {
  if (emails.length === 0) return { ids: [], error: null };
  const payload = toPayload(emails);
  let lastError = "Resend did not accept the emails.";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await resend.batch.send(payload as any);
    if (!error && data) return { ids: (data as any).data.map((d: any) => d?.id ?? null), error: null };
    lastError = error?.message ?? lastError;
    if (!isRateLimit(error) || attempt === 2) break;
    await sleep(1500 * (attempt + 1));
  }
  return { ids: emails.map(() => null), error: lastError };
}

/** Same as sendBatchStrict but returns only the ids. */
export async function sendBatch(emails: OutboundEmail[]): Promise<(string | null)[]> {
  const r = await sendBatchStrict(emails);
  if (r.error) console.error("resend batch error", r.error);
  return r.ids;
}
