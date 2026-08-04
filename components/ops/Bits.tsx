// Small shared pieces of the Ops Hub blueprint system. Server-safe: no state.
// Visual rules (design_handoff_ops_hub/README.md): square corners everywhere,
// no filled containers, content separated by rules not boxes, one accent.
import Link from "next/link";

/** Registration marks — four + crosshairs outside a framed object. */
export function Reg({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`ops-reg ${className}`}>
      <span className="ops-corner tl" />
      <span className="ops-corner tr" />
      <span className="ops-corner bl" />
      <span className="ops-corner br" />
      {children}
    </div>
  );
}

/** Kicker / eyebrow label. */
export function Kicker({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`font-barlowc font-semibold uppercase text-[12px] tracking-[0.1em] text-[rgba(26,26,26,.62)] ${className}`}>
      {children}
    </div>
  );
}

/** Section band: heavy top rule + condensed uppercase heading. */
export function Band({
  title,
  right,
  children,
  className = "",
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-9 border-t border-ops-text pt-4 ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-barlowc font-semibold uppercase text-[22px] tracking-[0.06em] leading-none">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export type OpsTagTone = "accent" | "gold" | "danger" | "neutral";
const TAG_TONES: Record<OpsTagTone, string> = {
  accent: "bg-ops-accent-100 text-ops-accent-700",
  gold: "bg-ops-gold-100 text-ops-gold-deep",
  danger: "bg-[rgba(143,47,47,.12)] text-ops-danger",
  neutral: "bg-ops-surface text-[rgba(26,26,26,.68)]",
};

export function Tag({ tone = "neutral", children }: { tone?: OpsTagTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap px-2.5 py-[3px] text-[11px] font-barlow ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

/* Button class strings — buttons are 14px Condensed 600, square. */
export const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 font-barlowc font-semibold text-[14px] leading-tight px-4 py-2 min-h-[36px] bg-ops-accent text-ops-bg border border-ops-accent hover:bg-ops-accent-600 active:bg-ops-accent-700 cursor-pointer";
export const btnSecondary =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 font-barlowc font-semibold text-[14px] leading-tight px-4 py-2 min-h-[36px] text-ops-text border border-ops-divider hover:bg-[rgba(26,26,26,.07)] active:bg-[rgba(26,26,26,.14)] cursor-pointer";
export const btnGhost =
  "inline-flex items-center gap-1 whitespace-nowrap shrink-0 font-barlowc font-semibold text-[14px] text-ops-accent hover:text-ops-accent-600 cursor-pointer";

export const inputCls =
  "w-full min-h-[38px] px-2.5 py-1.5 font-barlow text-[14px] text-ops-text bg-ops-surface border border-ops-divider focus:border-ops-accent";

/** "Open <section> →" ghost link used in band headers. */
export function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={btnGhost}>
      {children} <span aria-hidden>→</span>
    </Link>
  );
}

export interface SubNavItem {
  label: string;
  href: string;
  active?: boolean;
  count?: number;
}

/** Second-row navigation: 48px on desktop, scrollable kickers on mobile. */
export function SubNav({ items, action }: { items: SubNavItem[]; action?: React.ReactNode }) {
  return (
    <div className="border-b border-ops-divider">
      <div className="mx-auto max-w-[1440px] px-5 md:px-12 flex items-center gap-[30px] h-12 overflow-x-auto ops-subnav">
        {items.map((it) => (
          <Link
            key={it.href + it.label}
            href={it.href}
            className={`shrink-0 font-barlowc font-semibold uppercase text-[13px] tracking-[0.08em] leading-none h-full flex items-center border-b-2 ${
              it.active ? "border-ops-accent text-ops-text" : "border-transparent text-[rgba(26,26,26,.62)] hover:text-ops-text"
            }`}
          >
            {it.label}
            {it.count ? <span className="ml-1.5 text-ops-gold-deep">{it.count}</span> : null}
          </Link>
        ))}
        {action && <div className="ml-auto shrink-0 py-1.5">{action}</div>}
      </div>
    </div>
  );
}

/** Segmented control (links variant) — joined group, selected fills accent. */
export function SegLinks({
  options,
}: {
  options: { label: string; href: string; selected?: boolean }[];
}) {
  return (
    <div className="inline-flex border border-ops-divider">
      {options.map((o, i) => (
        <Link
          key={o.label}
          href={o.href}
          className={`px-3 py-1.5 text-[13px] font-barlow whitespace-nowrap ${i > 0 ? "border-l border-ops-divider" : ""} ${
            o.selected ? "bg-ops-accent text-ops-bg" : "hover:bg-[rgba(26,26,26,.07)]"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
