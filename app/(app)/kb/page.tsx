import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { KB, KB_GROUPS } from "@/lib/kb";

export default function KbHome() {
  return (
    <>
      <PageHeader title="KB" sub="Step-by-step guides for running campaigns and the dashboard, so nothing depends on memory." />
      {KB_GROUPS.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="text-sm font-semibold text-muted mb-3">{g}</h2>
          <div className="grid grid-cols-2 gap-4">
            {KB.filter((a) => a.group === g).map((a) => (
              <Link key={a.slug} href={`/kb/${a.slug}`} className="panel p-5 hover:bg-slate block">
                <div className="font-semibold">{a.title}</div>
                <p className="text-sm text-muted mt-1">{a.summary}</p>
              </Link>))}
          </div>
        </section>))}
    </>
  );
}
