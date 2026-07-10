"use client";

// Shared account-detail primitives from the console redesign: initials avatar,
// kind pill (customer/prospect), due pill (check-in timing), and info tiles.

export function AccountAvatar({
  name,
  size = 60,
  square = false,
  className = "",
}: {
  name: string;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  const initials = name
    .replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className={`shrink-0 flex items-center justify-center font-serif font-semibold ${square ? "rounded-xl bg-gold-primary text-cream" : "rounded-full bg-green-primary text-cream"} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </div>
  );
}

export function KindPill({ kind }: { kind: "customer" | "prospect" }) {
  const pro = kind === "prospect";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${pro ? "bg-gold-primary/20 text-gold-dark" : "bg-green-primary/10 text-green-primary"}`}
    >
      {pro ? "🏪 Prospect" : "✓ Customer"}
    </span>
  );
}

/** daysOverdue ≥ 0 → "Nd overdue"; 0 → today; < 0 → "Due in Nd". */
export function DuePill({ daysOverdue }: { daysOverdue: number }) {
  const overdue = daysOverdue > 0;
  const today = daysOverdue === 0;
  const txt = overdue ? `${daysOverdue}d overdue` : today ? "Due today" : `Due in ${-daysOverdue}d`;
  const cls = overdue
    ? "bg-red-100 text-red-700"
    : today
    ? "bg-gold-primary/20 text-gold-dark"
    : "bg-charcoal/5 text-charcoal/50";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-body text-[11px] font-semibold ${cls}`}>
      🔔 {txt}
    </span>
  );
}

export function InfoTile({
  icon,
  label,
  value,
  href,
  action,
  mono = false,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
  action?: string;
  mono?: boolean;
}) {
  const body = (
    <>
      <span className="w-9 h-9 rounded-lg bg-cream flex items-center justify-center shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block font-body text-[10px] uppercase tracking-widest text-charcoal/40 mb-0.5">{label}</span>
        <span
          className={`block truncate text-charcoal ${mono ? "font-mono text-[16px] font-semibold tracking-[0.12em]" : "font-body text-sm font-medium"}`}
        >
          {value}
        </span>
      </span>
      {action && (
        <span className="shrink-0 font-body text-[10px] uppercase tracking-widest text-green-primary font-semibold">{action}</span>
      )}
    </>
  );
  const cls = "flex items-center gap-3 bg-white/60 border border-cream-dark rounded-xl px-3.5 py-3 min-w-0";
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={`${cls} hover:border-green-primary/40 transition-colors`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
