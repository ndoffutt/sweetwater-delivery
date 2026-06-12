// Shown instantly while a dispatch section's data loads, so navigation feels
// snappy instead of flashing a blank screen. Renders inside MgrShell.
export default function Loading() {
  return (
    <div className="p-5 md:p-8 md:max-w-3xl md:mx-auto animate-pulse">
      <div className="h-7 w-44 bg-cream-dark rounded mb-2" />
      <div className="h-3 w-28 bg-cream-dark/70 rounded mb-7" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-cream rounded-xl border border-cream-dark p-4 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-full bg-cream-dark shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/2 bg-cream-dark rounded" />
              <div className="h-3 w-1/3 bg-cream-dark/60 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
