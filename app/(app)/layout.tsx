import { requireUser } from "@/lib/auth";
import { Nav } from "@/components/Nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen grid grid-cols-[232px_1fr]">
      <Nav email={user.email ?? ""} />
      <main className="min-w-0 px-10 py-8 max-w-[1240px]">{children}</main>
    </div>
  );
}
