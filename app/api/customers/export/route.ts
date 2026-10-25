import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { allCustomers, readFilters } from "@/lib/customers";
import { centralStamp, monthsText, tyText } from "@/lib/customerFields";

export const dynamic = "force-dynamic";

/** GET ?q=&status=&source=&ty=&m= -> every customer matching the filters, as a CSV for Excel. The columns can be imported back. */
export async function GET(req: Request) {
  const { data: u } = await supabaseServer().auth.getUser();
  if (!u.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const f = readFilters(Object.fromEntries(new URL(req.url).searchParams));
  let rows;
  try { rows = await allCustomers(f); }
  catch (e: any) { return NextResponse.json({ error: String(e.message ?? e) + " (Did you run supabase/patch-011.sql?)" }, { status: 500 }); }

  // A cell starting with = @ (or + - not followed by a plain phone number) is prefixed so Excel never runs it as a formula.
  const esc = (v: unknown) => { let s = String(v ?? ""); if (/^[=@]/.test(s) || /^[+-](?![\d\s().-]+$)/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
  const head = ["Customer name", "Company", "Email", "Phone", "Registered (Central)", "Status", "TY", "First used month", "Source", "Paid returns", "Last filed", "Unsubscribed"];
  const lines = rows.map((r) => [
    r.name, r.company, r.email, r.phone, centralStamp(r.registered_at), r.status, tyText(r.tax_year), monthsText(r.fum_months),
    r.source, r.paid_returns, r.last_filed_at ? r.last_filed_at.slice(0, 10) : "", r.suppressed ? "Yes" : "",
  ].map(esc).join(","));
  const stamp = new Date().toISOString().slice(0, 10);
  const name = ["customers", f.ty ? "TY" + tyText(f.ty) : "", f.status?.replace(/[^a-z]+/gi, "-") ?? "", stamp].filter(Boolean).join("-");
  return new NextResponse("﻿" + [head.map(esc).join(","), ...lines].join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"`, "cache-control": "no-store" },
  });
}
