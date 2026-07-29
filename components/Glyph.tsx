// Shared line-icon set for the office console. One stroke style everywhere in
// place of mixed emoji — emoji render differently per device and read as a
// hobby app, not a luxury brand.
export type GlyphName =
  | "van" | "phone" | "chat" | "clock" | "mail" | "walk" | "bell" | "note"
  | "alert" | "compass" | "chart" | "inbox" | "pin" | "camera" | "check" | "person";

export default function Glyph({
  name,
  className = "w-4 h-4",
}: {
  name: GlyphName;
  className?: string;
}) {
  const p = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<GlyphName, React.ReactNode> = {
    van: <g {...p}><path d="M3 6h10v9H3zM13 9h4l3 3v3h-7z" /><circle cx="7" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></g>,
    phone: <path {...p} d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 013.5 5.6 1.5 1.5 0 015 4z" />,
    chat: <g {...p}><path d="M4 5h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-4.5 3.5V17H4a1 1 0 01-1-1V6a1 1 0 011-1z" /><path d="M8 9.5h8M8 12.5h5" /></g>,
    clock: <g {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></g>,
    mail: <g {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></g>,
    walk: <g {...p}><circle cx="13" cy="4.5" r="1.8" /><path d="M10 21l2.5-6L10 12l1-4.5 3 1 2.5 3M8 12.5L10 8l3-1M14 21l-1.5-4.5" /></g>,
    bell: <g {...p}><path d="M6 9.5a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2.2 2.2 0 004 0" /></g>,
    note: <g {...p}><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 11h6M9 15h6" /></g>,
    alert: <g {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.4" fill="currentColor" /></g>,
    compass: <g {...p}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></g>,
    chart: <g {...p}><path d="M4 20V4M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12.5" y="8" width="3" height="9" /><rect x="18" y="14" width="3" height="3" /></g>,
    inbox: <g {...p}><path d="M4 13l2.5-8h11L20 13v6H4v-6z" /><path d="M4 13h5a3 3 0 006 0h5" /></g>,
    pin: <g {...p}><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></g>,
    camera: <g {...p}><path d="M3 8a2 2 0 012-2h2l1.2-1.8A2 2 0 0110 3.5h4a2 2 0 011.7 1L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><circle cx="12" cy="12.5" r="3.3" /></g>,
    check: <path {...p} d="M4 12.5l5 5L20 6.5" />,
    person: <g {...p}><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0113 0" /></g>,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}
