import { Resend } from "resend";
export const resend = new Resend(process.env.RESEND_API_KEY);

export type OutboundEmail = {
  to: string; subject: string; html: string; text: string; unsubscribeUrl: string;
  tags?: { name: string; value: string }[];
};

/** Sends up to 100 emails in one Resend batch call. Returns ids aligned with input order (null on failure). */
export async function sendBatch(emails: OutboundEmail[]): Promise<(string | null)[]> {
  if (emails.length === 0) return [];
  const from = process.env.EMAIL_FROM!;
  const replyTo = process.env.EMAIL_REPLY_TO;
  const payload = emails.map((e) => ({
    from, to: [e.to], subject: e.subject, html: e.html, text: e.text,
    reply_to: replyTo,
    headers: { "List-Unsubscribe": `<${e.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: e.tags,
  }));
  const { data, error } = await resend.batch.send(payload as any);
  if (error || !data) { console.error("resend batch error", error); return emails.map(() => null); }
  return data.data.map((d: any) => d?.id ?? null);
}
