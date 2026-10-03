import Link from "next/link";
import { n } from "@/lib/format";

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-7">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="text-muted mt-1">{sub}</p>}</div>
      {action}
    </div>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: number | string; tone?: "sign" | "amber" | "brick"; sub?: string }) {
  const color = tone === "sign" ? "text-sign" : tone === "amber" ? "text-amber" : tone === "brick" ? "text-brick" : "text-ink";
  return (
    <div className="panel px-5 py-4">
      <div className="text-sm text-muted">{label}</div>
      <div className={`text-3xl font-bold mt-1 ${color}`}>{typeof value === "number" ? n(value) : value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-slate text-ink", in_sequence: "bg-amberSoft text-amber", customer: "bg-signSoft text-sign", replied: "bg-signSoft text-sign",
    bounced: "bg-brickSoft text-brick", complained: "bg-brickSoft text-brick", unsubscribed: "bg-slate text-muted",
    draft: "bg-slate text-ink", scheduled: "bg-amberSoft text-amber", running: "bg-signSoft text-sign", paused: "bg-amberSoft text-amber", completed: "bg-slate text-muted",
  };
  const label = status.replace("_", " ");
  return <span className={`pill ${map[status] ?? "bg-slate text-ink"}`}>{label}</span>;
}

export function Empty({ title, body, cta, href }: { title: string; body: string; cta?: string; href?: string }) {
  return (
    <div className="panel px-8 py-14 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted mt-1 max-w-md mx-auto">{body}</p>
      {cta && href && <Link href={href} className="btn-primary mt-5">{cta}</Link>}
    </div>
  );
}
