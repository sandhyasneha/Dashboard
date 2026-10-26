import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";

/** Shown on campaign pages while Hold all sending is on (or not set up yet, which also holds). */
export async function HoldBanner() {
  const { data, error } = await supabaseAdmin().from("settings").select("hold_all").eq("id", 1).maybeSingle();
  if (!error && data && data.hold_all === false) return null;
  return (
    <div className="panel p-4 mb-6 bg-amberSoft text-sm">
      <strong>Sending is on hold.</strong> No campaign email goes out, even for campaigns marked running. Test emails still work. Release it in <Link href="/settings" className="text-sign font-medium hover:underline">Settings</Link> once Marketing confirms.
    </div>
  );
}
