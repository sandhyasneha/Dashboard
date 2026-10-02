"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const sections = [
  { title: "Dashboard", items: [
    { href: "/", label: "Overview" },
    { href: "/dashboard/filings", label: "Filings & revenue" },
    { href: "/dashboard/customers", label: "Customer growth" },
    { href: "/dashboard/retention", label: "Retention" },
  ]},
  { title: "Email campaign", items: [
    { href: "/campaigns", label: "Campaigns" },
    { href: "/leads", label: "Leads" },
    { href: "/customers", label: "Converted" },
    { href: "/settings", label: "Settings" },
  ]},
];

export function Nav({ email }: { email: string }) {
  const path = usePathname();
  const router = useRouter();
  async function signOut() {
    const sb = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    await sb.auth.signOut({ scope: "local" }); router.push("/login"); router.refresh();
  }
  return (
    <aside className="border-r border-line bg-white flex flex-col">
      <div className="px-6 pt-7 pb-6 border-b border-line">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-7 h-7 rounded-[3px] bg-sign" aria-hidden />
          <div><div className="font-bold leading-tight">TruckTaxPro</div><div className="text-xs text-muted">Admin</div></div>
        </div>
      </div>
      <nav className="px-3 py-4 flex-1">
        {sections.map((s) => (
          <div key={s.title} className="mb-5">
            <div className="px-3 mb-1.5 text-xs font-semibold text-muted">{s.title}</div>
            {s.items.map((i) => {
              const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
              return (
                <Link key={i.href} href={i.href}
                  className={`block rounded-md px-3 py-2 text-sm font-medium mb-0.5 ${active ? "bg-signSoft text-sign" : "text-ink hover:bg-slate"}`}>
                  {i.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="px-6 py-4 border-t border-line text-xs text-muted">
        <div className="truncate mb-1">{email}</div>
        <button onClick={signOut} className="underline hover:text-ink">Sign out</button>
      </div>
    </aside>
  );
}
