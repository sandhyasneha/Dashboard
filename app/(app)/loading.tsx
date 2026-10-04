// Shown instantly while a page fetches fresh data, so a click always gives feedback.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-7 w-56 bg-slate rounded mb-3" />
      <div className="h-4 w-96 max-w-full bg-slate rounded mb-8" />
      <div className="grid grid-cols-4 gap-4 mb-6">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 panel" />)}</div>
      <div className="h-72 panel" />
    </div>
  );
}
