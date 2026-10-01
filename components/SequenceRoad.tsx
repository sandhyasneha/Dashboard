import { n } from "@/lib/format";

type Step = { label: string; subject: string; delay: number; count: number };

/** The campaign drawn as a road: each step a sign, the count of carriers who've passed it beneath. */
export function SequenceRoad({ steps, enrolled, converted, bounced }: { steps: Step[]; enrolled: number; converted: number; bounced: number }) {
  const cols = steps.length + 2;
  return (
    <div className="relative">
      <div className="absolute left-0 right-0 top-[38px] h-2 bg-ink rounded-full" aria-hidden />
      <div className="absolute left-0 right-0 top-[41px] h-0.5 border-t-2 border-dashed border-amber" aria-hidden />
      <div className="relative grid gap-4" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        <Sign label="Enrolled" count={enrolled} tone="ink" />
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col items-center text-center">
            {i > 0 && <div className="text-xs text-muted absolute -mt-1" style={{ transform: "translateY(-22px)" }}>wait {s.delay}d</div>}
            <div className="w-full bg-sign text-white rounded-md px-3 py-2 shadow-card z-10">
              <div className="text-xs opacity-80">{s.label}</div>
              <div className="text-sm font-semibold truncate" title={s.subject}>{s.subject || "Untitled"}</div>
            </div>
            <div className="w-1 h-4 bg-muted/40" aria-hidden />
            <div className="text-2xl font-bold mt-1">{n(s.count)}</div>
            <div className="text-xs text-muted">sent</div>
          </div>
        ))}
        <div className="flex flex-col items-center text-center">
          <div className="w-full bg-signSoft text-sign border border-sign rounded-md px-3 py-2 z-10">
            <div className="text-xs">Exit</div><div className="text-sm font-semibold">Filed on TruckTaxPro</div>
          </div>
          <div className="w-1 h-4 bg-muted/40" aria-hidden />
          <div className="text-2xl font-bold mt-1 text-sign">{n(converted)}</div>
          <div className="text-xs text-muted">converted · {n(bounced)} bounced</div>
        </div>
      </div>
    </div>
  );
}

function Sign({ label, count, tone }: { label: string; count: number; tone: "ink" }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-full bg-white border border-ink rounded-md px-3 py-2 z-10"><div className="text-xs text-muted">Start</div><div className="text-sm font-semibold">{label}</div></div>
      <div className="w-1 h-4 bg-muted/40" aria-hidden />
      <div className="text-2xl font-bold mt-1">{n(count)}</div>
      <div className="text-xs text-muted">carriers</div>
    </div>
  );
}
