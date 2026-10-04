import Link from "next/link";

/** Page controls under a table. Keeps the search and filter in the address, so Next and Previous never lose them. */
export function Pager({ path, params, page, pageSize, total }: { path: string; params: Record<string, string | undefined>; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) u.set(k, v);
    if (p > 1) u.set("p", String(p));
    const s = u.toString(); return s ? `${path}?${s}` : path;
  };
  const from = total ? (page - 1) * pageSize + 1 : 0, to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-line text-sm text-muted">
      <span>{total ? `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()}` : "No matches"}</span>
      <span className="flex items-center gap-2">
        {page > 1 && <Link className="btn-secondary h-8" href={href(page - 1)}>Previous</Link>}
        <span>Page {page} of {pages.toLocaleString()}</span>
        {page < pages && <Link className="btn-secondary h-8" href={href(page + 1)}>Next</Link>}
      </span>
    </div>
  );
}
