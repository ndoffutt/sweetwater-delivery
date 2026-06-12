// Branded full-screen splash while the driver's route loads.
export default function Loading() {
  return (
    <div className="fixed inset-0 bg-cream-dark flex flex-col items-center justify-center gap-5">
      <div className="text-center">
        <div className="font-serif text-3xl font-light text-green-primary leading-none">
          Sweetwater&apos;s
        </div>
        <div className="text-[11px] uppercase tracking-[0.2em] text-gold-dark mt-1">
          Delivery
        </div>
      </div>
      <div className="w-8 h-8 rounded-full border-2 border-green-primary/25 border-t-green-primary animate-spin" />
      <div className="text-xs uppercase tracking-widest text-charcoal/40 font-body">
        Loading your route…
      </div>
    </div>
  );
}
