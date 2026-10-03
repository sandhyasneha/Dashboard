import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const MODEL = "claude-haiku-4-5-20251001"; // the smallest, cheapest model: plenty for a short email

const SYSTEM = `You write emails for TruckTaxPro, a service that e-files IRS Form 2290 (the Heavy Highway Vehicle Use Tax return) for truckers and small trucking companies in the United States. The reader is a trucker or fleet owner.

Style: plain, warm and direct, like one person writing to one person. Short sentences. No hype, no emojis, no ALL CAPS, no exclamation marks, no filler.

Format: start with "Hi there," on its own line. Then 2 to 4 short paragraphs separated by blank lines, 70 to 130 words in total. You may use **bold** for one key phrase. Include exactly one call-to-action link, alone on its own line, in this form: [short action text](https://trucktaxpro.com). Do not sign off with a name or company, and do not mention unsubscribing: a footer is added automatically.

Facts you may use: Form 2290 applies to highway vehicles with a taxable gross weight of 55,000 pounds or more. The tax period runs July 1 to June 30. A return is due by the last day of the month after the month the vehicle is first used on public highways. For vehicles in service on July 1 that date is August 31. Late filing can bring IRS penalties and interest. The stamped Schedule 1 is the proof of payment used for registration. TruckTaxPro files the return electronically with the IRS.

Strict rules: never state prices, discounts, turnaround times, guarantees, phone numbers or specific dates unless they appear in the details you were given. If you are not sure of a fact, leave it out. Output only the email body, nothing else.`;

/** POST { title, notes?, position?, previous? } -> { body }. Logged-in admin only. */
export async function POST(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "ANTHROPIC_API_KEY is not set in Vercel (Settings, Environment Variables). Add it and redeploy to use the AI writer." }, { status: 500 });

  const b = await req.json();
  const title = String(b.title ?? "").trim().slice(0, 200);
  if (title.length < 3) return NextResponse.json({ error: "Type a title for the email first. The AI writes the text from it." }, { status: 400 });
  const notes = String(b.notes ?? "").trim().slice(0, 600);
  const position = Math.max(0, Math.floor(Number(b.position) || 0));
  const previous = String(b.previous ?? "").trim().slice(0, 1500);

  const kind = position === 0
    ? "This is the first email of a sequence."
    : `This is follow-up email number ${position} in a sequence. Keep it short, 40 to 80 words, and do not repeat the whole first email.${previous ? `\nThe first email said:\n${previous}` : ""}`;
  const user = `Title of the email (it is also the subject line): ${title}\n${notes ? `Details to include: ${notes}\n` : ""}${kind}\n\nWrite the email body now.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 600, system: SYSTEM, messages: [{ role: "user", content: user }] }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) return NextResponse.json({ error: `The AI service said: ${j?.error?.message ?? res.status}` }, { status: 502 });

  let text = (j.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("").trim();
  text = text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();
  if (!text) return NextResponse.json({ error: "The AI returned nothing. Try again." }, { status: 502 });
  return NextResponse.json({ body: text });
}
