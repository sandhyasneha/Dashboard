import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { kbBySlug } from "@/lib/kb";

function Rich({ text }: { text: string }) {
  return <>{text.split("`").map((part, i) => (i % 2 ? <code key={i} className="px-1 py-0.5 rounded bg-slate text-[0.85em]">{part}</code> : part))}</>;
}

export default function Article({ params }: { params: { slug: string } }) {
  const a = kbBySlug(params.slug);
  if (!a) notFound();
  return (
    <div className="max-w-3xl">
      <Link href="/kb" className="text-sm text-sign font-medium">&larr; All guides</Link>
      <div className="mt-3"><PageHeader title={a.title} sub={a.summary} /></div>
      <div className="space-y-6">
        {a.sections.map((s, i) => (
          <section key={i} className="panel p-6">
            <h2 className="font-semibold mb-3">{s.heading}</h2>
            {s.text && <p className="text-sm leading-relaxed"><Rich text={s.text} /></p>}
            {s.steps && <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">{s.steps.map((t, k) => <li key={k}><Rich text={t} /></li>)}</ol>}
            {s.code && <pre className="text-xs bg-slate rounded-md p-3 mt-3 overflow-x-auto whitespace-pre-wrap">{s.code}</pre>}
            {s.note && <div className="bg-amberSoft rounded-md p-3 mt-3 text-sm leading-relaxed"><Rich text={s.note} /></div>}
          </section>))}
      </div>
    </div>
  );
}
