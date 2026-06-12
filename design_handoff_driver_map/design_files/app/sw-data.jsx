// sw-data.jsx — Sweetwater's shared theme, icons, mock route, and stylized map.
// Exports to window: SW, Icon, makeStops, StreetMap, fmtMoney

// ─────────────────────────────────────────────────────────────
// Brand theme (from tailwind.config.ts)
// ─────────────────────────────────────────────────────────────
const SW = {
  green: "#02733e",
  greenDark: "#015a30",
  greenLight: "#028a4a",
  gold: "#d59a29",
  goldLight: "#e8b84b",
  goldDark: "#b8821f",
  cream: "#FAF7F2",
  creamDark: "#F0EBE1",
  charcoal: "#1A1A1A",
  serif: '"Cormorant Garamond", Georgia, serif',
  body: '"Jost", system-ui, sans-serif',
  // status bar safe-area inset so headers clear the dynamic island
  safeTop: 56,
};

// ─────────────────────────────────────────────────────────────
// Line icons — clean, single-stroke, 24px grid
// ─────────────────────────────────────────────────────────────
function Icon({ name, size = 22, color = "currentColor", strokeWidth = 2, style = {} }) {
  const p = {
    fill: "none",
    stroke: color,
    strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const paths = {
    phone: <path {...p} d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 013.5 5.6 1.5 1.5 0 015 4z" />,
    nav: <path {...p} d="M21 4L3 11l7 2.5L12.5 21 21 4z" />,
    pin: <g {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></g>,
    camera: <g {...p}><path d="M3 8a2 2 0 012-2h2l1.2-1.8A2 2 0 0110 3.5h4a2 2 0 011.7 1L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><circle cx="12" cy="12.5" r="3.3" /></g>,
    check: <path {...p} d="M4 12.5l5 5L20 6.5" />,
    chevron: <path {...p} d="M9 5l7 7-7 7" />,
    chevronUp: <path {...p} d="M5 15l7-7 7 7" />,
    back: <path {...p} d="M15 5l-7 7 7 7" />,
    arrowUp: <path {...p} d="M12 19V5M6 11l6-6 6 6" />,
    arrowDown: <path {...p} d="M12 5v14M6 13l6 6 6-6" />,
    alert: <g {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.4" fill={color} /></g>,
    bag: <g {...p}><path d="M6 8h12l-1 12H7L6 8z" /><path d="M9 8V6a3 3 0 016 0v2" /></g>,
    key: <g {...p}><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M18 18l2-2" /></g>,
    wifi: <g {...p}><path d="M2 8.5a15 15 0 0120 0" /><path d="M5 12a10 10 0 0114 0" /><path d="M8.5 15.5a5 5 0 017 0" /><circle cx="12" cy="19" r="0.5" fill={color} /></g>,
    cloud: <path {...p} d="M7 18a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.4A3.8 3.8 0 0118 18H7z" />,
    cloudCheck: <g {...p}><path d="M7 17a4 4 0 01-.5-8 5.5 5.5 0 0110.6-1.4A3.8 3.8 0 0117.5 17" /><path d="M9 16.5l2 2 4-4" /></g>,
    user: <g {...p}><circle cx="12" cy="8" r="4" /><path d="M4 20a8 8 0 0116 0" /></g>,
    clock: <g {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
    route: <g {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H14a3 3 0 000-6H9a3 3 0 010-6h6.5" /></g>,
    grip: <g fill={color}><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></g>,
    plus: <path {...p} d="M12 5v14M5 12h14" />,
    x: <path {...p} d="M6 6l12 12M18 6L6 18" />,
    sparkle: <path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }}>
      {paths[name]}
    </svg>
  );
}

function fmtMoney(n) {
  return "$" + n.toFixed(2);
}

// Google Maps directions handoff — routes from the driver's current location.
function mapsHref(stop) {
  return "https://www.google.com/maps/dir/?api=1&destination=" +
    encodeURIComponent(stop.address + ", " + stop.town);
}

// ─────────────────────────────────────────────────────────────
// Mock route — a slice of the ~50-customer Hamptons book
// x/y are 0–100 % positions on the stylized map
// ─────────────────────────────────────────────────────────────
function makeStops() {
  return [
    {
      id: "s1", order: 1, name: "Doris Meister", address: "30 Cove Hollow Farm Rd",
      town: "East Hampton", phone: "(631) 324-1157", gate: "2480",
      notes: "Gate at the end of the drive — code above. Garments to the side mudroom.",
      dropoff: true, pickup: true, x: 63.5, y: 68.6,
    },
    {
      id: "s2", order: 2, name: "Diane Curland", address: "20 Baiting Hollow Rd",
      town: "East Hampton", phone: "(201) 805-8686", gate: null,
      notes: "Leave with housekeeper, weekday mornings.",
      dropoff: true, pickup: false, x: 69, y: 64.1,
    },
    {
      id: "s3", order: 3, name: "Shirin Kaufman", address: "41 Hwy Behind the Pond",
      town: "East Hampton", phone: "(917) 742-1418", gate: null,
      notes: "On-demand pickup only. Call before arrival.",
      dropoff: false, pickup: true, x: 78.9, y: 62.7,
    },
    {
      id: "s4", order: 4, name: "Wendy Frank", address: "117 Pantigo Rd",
      town: "East Hampton", phone: "(917) 880-8506", gate: "1170",
      notes: "Ring bell once. Two friendly dogs on property.",
      dropoff: true, pickup: true, x: 80.5, y: 52.9,
    },
    {
      id: "s5", order: 5, name: "Lauren Feldman", address: "123 Abrahams Path",
      town: "East Hampton", phone: "(917) 744-9898", gate: null,
      notes: "Mudroom door, around back.",
      dropoff: true, pickup: false, x: 83.5, y: 36.8,
    },
    {
      id: "s6", order: 6, name: "Laura Rubin", address: "53 Franklin St",
      town: "Sag Harbor", phone: "(917) 861-2036", gate: null,
      notes: "Village house — leave on the front porch.",
      dropoff: true, pickup: true, x: 38.6, y: 34,
    },
    {
      id: "s7", order: 7, name: "Lu Geffen", address: "41 Sunset Beach Rd",
      town: "Sag Harbor", phone: "(631) 919-5156", gate: "0041",
      notes: "Long private drive. Caretaker on site mornings.",
      dropoff: true, pickup: false, x: 28.7, y: 20,
    },
    {
      id: "s8", order: 8, name: "Annie Curtin", address: "246 Bridge Ln",
      town: "Bridgehampton", phone: "(631) 903-9546", gate: "2460",
      notes: "On-demand pickup. Use the second gate by the hedge.",
      dropoff: false, pickup: true, x: 37.1, y: 83,
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// StreetMap — stylized, no-tile faux map of the South Fork
// Soft cream land, a couple of sand/green blobs, ocean band,
// faint road grid + a couple of named arteries.
// children render on top (pins, driver dot, route line).
// ─────────────────────────────────────────────────────────────
function StreetMap({ children, style = {}, labelRoads = true }) {
  const roadV = (x, w = 1.2) => (
    <line key={"v" + x} x1={x} y1="0" x2={x} y2="100" stroke="#fff" strokeWidth={w} strokeOpacity="0.9" />
  );
  const roadH = (y, w = 1.2) => (
    <line key={"h" + y} x1="0" y1={y} x2="100" y2={y} stroke="#fff" strokeWidth={w} strokeOpacity="0.9" />
  );
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#EAE6DC", ...style }}>
      {/* land tint + parks */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <rect x="0" y="0" width="100" height="100" fill="#EDE8DD" />
        {/* green spaces */}
        <ellipse cx="28" cy="22" rx="14" ry="9" fill="#dfe7d2" />
        <ellipse cx="82" cy="58" rx="11" ry="13" fill="#dfe7d2" />
        <ellipse cx="50" cy="80" rx="20" ry="10" fill="#dfe7d2" />
        {/* ocean band along the bottom-right */}
        <path d="M0 92 Q40 84 70 90 T100 88 V100 H0 Z" fill="#cfe0e6" />
        {/* faint block grid */}
        <g>
          {[14, 28, 42, 56, 70, 84].map((x) => roadV(x, 0.8))}
          {[16, 32, 48, 64, 80].map((y) => roadH(y, 0.8))}
        </g>
        {/* main arteries */}
        <path d="M-2 64 Q30 56 60 60 T102 52" stroke="#fff" strokeWidth="3" fill="none" strokeOpacity="0.95" />
        <path d="M20 -2 Q26 30 40 50 T58 102" stroke="#fff" strokeWidth="2.6" fill="none" strokeOpacity="0.95" />
      </svg>
      {labelRoads && (
        <>
          <span style={lbl(8, 60, -6)}>Montauk Hwy</span>
          <span style={lbl(70, 86)}>Atlantic Ocean</span>
        </>
      )}
      {children}
    </div>
  );
}
function lbl(left, top, rot = 0) {
  return {
    position: "absolute", left: left + "%", top: top + "%",
    transform: `rotate(${rot}deg)`,
    fontFamily: SW.body, fontSize: 9, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "rgba(26,26,26,0.32)", pointerEvents: "none",
  };
}

// map pin — teardrop with number / check
function Pin({ n, done, active }) {
  const bg = done ? "rgba(2,115,62,0.55)" : active ? SW.gold : SW.green;
  return (
    <div style={{ position: "relative",
      filter: active ? "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}>
      <div style={{ width: active ? 36 : 28, height: active ? 36 : 28, borderRadius: "50% 50% 50% 0",
        transform: "rotate(-45deg)", background: bg, border: "2px solid #fff",
        display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ transform: "rotate(45deg)", color: done ? "#fff" : active ? SW.charcoal : "#fff",
          fontFamily: SW.body, fontSize: active ? 15 : 12, fontWeight: 700 }}>
          {done ? "✓" : n}
        </span>
      </div>
    </div>
  );
}

Object.assign(window, { SW, Icon, makeStops, StreetMap, fmtMoney, mapsHref, Pin });
