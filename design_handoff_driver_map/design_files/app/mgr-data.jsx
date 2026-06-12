// mgr-data.jsx — Manager view: extended icons + rich customer/history/manifest data.
// Reuses window.SW, StreetMap, Pin from sw-data.jsx. Exports MIcon, CUSTOMERS, HISTORY, MANIFEST_TEXT, todayStops.
const _s = window.SW;

// Extended icon set for the manager console (line, 24 grid)
function MIcon({ name, size = 20, color = "currentColor", strokeWidth = 2, style = {} }) {
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    dispatch: <g {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H14a3 3 0 000-6H9a3 3 0 010-6h6.5" /></g>,
    customers: <g {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0111 0" /><path d="M16 5.2a3.2 3.2 0 010 5.6M18 19a5.5 5.5 0 00-3-4.9" /></g>,
    history: <g {...p}><path d="M3.5 12a8.5 8.5 0 108.5-8.5A8.5 8.5 0 005 7" /><path d="M5 3.5V7h3.5" /><path d="M12 8v4.2l2.8 1.8" /></g>,
    live: <g {...p}><circle cx="12" cy="10" r="2.2" /><path d="M12 21s6-5 6-10a6 6 0 10-12 0c0 5 6 10 6 10z" /></g>,
    reports: <g {...p}><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></g>,
    search: <g {...p}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></g>,
    upload: <g {...p}><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" /></g>,
    file: <g {...p}><path d="M6 3h8l4 4v14a0 0 0 010 0H6a0 0 0 010 0V3z" /><path d="M14 3v4h4" /></g>,
    sparkle: <path {...p} d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />,
    phone: <path {...p} d="M5 4h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5A16 16 0 013.5 5.6 1.5 1.5 0 015 4z" />,
    key: <g {...p}><circle cx="8" cy="8" r="4" /><path d="M11 11l8 8M16 16l2-2M18 18l2-2" /></g>,
    pin: <g {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></g>,
    edit: <g {...p}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14 6l4 4" /></g>,
    plus: <path {...p} d="M12 5v14M5 12h14" />,
    x: <path {...p} d="M6 6l12 12M18 6L6 18" />,
    check: <path {...p} d="M4 12.5l5 5L20 6.5" />,
    chevron: <path {...p} d="M9 5l7 7-7 7" />,
    chevronDown: <path {...p} d="M5 9l7 7 7-7" />,
    grip: <g fill={color}><circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" /></g>,
    arrowUp: <path {...p} d="M12 19V5M6 11l6-6 6 6" />,
    arrowDown: <path {...p} d="M12 5v14M6 13l6 6 6-6" />,
    clock: <g {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></g>,
    camera: <g {...p}><path d="M3 8a2 2 0 012-2h2l1.2-1.8A2 2 0 0110 3.5h4a2 2 0 011.7 1L17 6h2a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /><circle cx="12" cy="12.5" r="3.3" /></g>,
    star: <path {...p} d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9L12 3.5z" />,
    truck: <g {...p}><rect x="2" y="7" width="12" height="9" rx="1" /><path d="M14 10h4l3 3v3h-7z" /><circle cx="6.5" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></g>,
    send: <path {...p} d="M21 4L3 11l7 2.5L12.5 21 21 4z" />,
    alert: <g {...p}><path d="M12 3l9.5 16.5H2.5L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.4" fill={color} /></g>,
    dot: <circle cx="12" cy="12" r="3" fill={color} stroke="none" />,
    logout: <g {...p}><path d="M14 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4" /><path d="M9 12h11M16 8l4 4-4 4" /></g>,
    calendar: <g {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9h17M8 3v4M16 3v4" /></g>,
    download: <g {...p}><path d="M12 4v11M7 10l5 5 5-5" /><path d="M4 19h16" /></g>,
    menu: <path {...p} d="M4 7h16M4 12h16M4 17h16" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", ...style }}>{paths[name]}</svg>;
}

// ── Customer directory — REAL Sweetwater's book from the SPOT export.
// SPOT provides: name, address, town, phone, account #, lat/lng.
// gate / tags / notes / lastDelivered are OUR augmentations (not from SPOT) —
// maintained by the shop and editable by drivers from the road.
const CUSTOMERS = [
  { id: "1001902", name: "Doris Meister", address: "30 Cove Hollow Farm Rd", town: "East Hampton", phone: "(631) 324-1157",
    acct: "SOF *5022", tags: ["VIP"], lastDelivered: "Jun 6", x: 63.5, y: 68.6,
    notes: "Gate at the end of the drive — code below. Garments to the side mudroom." , gate: "2480" },
  { id: "1012899", name: "Diane Curland", address: "20 Baiting Hollow Rd", town: "East Hampton", phone: "(201) 805-8686",
    acct: "SOF *1328", tags: [], lastDelivered: "Jun 4", x: 69, y: 64.1, gate: null,
    notes: "Leave with housekeeper, weekday mornings." },
  { id: "1015237", name: "Shirin Kaufman", address: "41 Hwy Behind the Pond", town: "East Hampton", phone: "(917) 742-1418",
    acct: "SOF *0117", tags: ["Seasonal"], lastDelivered: "May 31", x: 78.9, y: 62.7, gate: null,
    notes: "On-demand pickups only. Call before arrival." },
  { id: "1004186", name: "Nancy Marks", address: "14 Tyson Ln", town: "East Hampton", phone: "(631) 804-3346",
    acct: "SOF *3950", tags: [], lastDelivered: "Jun 6", x: 89.7, y: 56.4, gate: null, notes: "Front porch, covered bench." },
  { id: "1001441", name: "Wendy Frank", address: "117 Pantigo Rd", town: "East Hampton", phone: "(917) 880-8506",
    acct: "SOF *6003", tags: ["VIP"], lastDelivered: "Jun 5", x: 80.5, y: 52.9, gate: "1170",
    notes: "Ring bell once. Two friendly dogs on property." },
  { id: "SA6412", name: "Andrew Goldman", address: "136 N Main St", town: "East Hampton", phone: "(315) 717-5735",
    acct: "SOF *3779", tags: [], lastDelivered: "Jun 2", x: 78.4, y: 51.4, gate: null, notes: "Apartment over the garage, side stairs." },
  { id: "SA5213", name: "Lauren Feldman", address: "123 Abrahams Path", town: "East Hampton", phone: "(917) 744-9898",
    acct: "SOF *6010", tags: ["Seasonal"], lastDelivered: "May 28", x: 83.5, y: 36.8, gate: null, notes: "Mudroom door, around back." },
  { id: "1015268", name: "Scott Nick Lazarz", address: "14 Masthead Ln", town: "East Hampton", phone: "(212) 256-1987",
    acct: "SOF *4155", tags: [], lastDelivered: "Jun 3", x: 63.9, y: 9.7, gate: null, notes: "End of the lane, by the water." },
  { id: "SA6413", name: "Laura Rubin", address: "53 Franklin St", town: "Sag Harbor", phone: "(917) 861-2036",
    acct: "SOF *8004", tags: ["VIP"], lastDelivered: "Jun 5", x: 38.6, y: 34, gate: null, notes: "Village house — leave on the front porch." },
  { id: "1005425", name: "Lu Geffen", address: "41 Sunset Beach Rd", town: "Sag Harbor", phone: "(631) 919-5156",
    acct: "SOF *4007", tags: ["VIP", "Seasonal"], lastDelivered: "Jun 1", x: 28.7, y: 20, gate: "0041",
    notes: "Long private drive. Caretaker on site mornings." },
  { id: "SA6407", name: "Johanna Kohr", address: "15 Wildwood Rd", town: "Sag Harbor", phone: "(415) 310-2527",
    acct: "SOF *0751", tags: [], lastDelivered: "May 24", x: 9.1, y: 41.4, gate: null, notes: "North Haven — gate usually open." },
  { id: "1003764", name: "Bob Novak", address: "323 Butter Ln", town: "Bridgehampton", phone: "(631) 800-9893",
    acct: "SOF *6001", tags: [], lastDelivered: "Jun 4", x: 29.5, y: 68.4, gate: null, notes: "Barn entrance on the left." },
  { id: "SA5572", name: "Sam Poser", address: "74 Kellis Pond Ln", town: "Water Mill", phone: "(954) 288-7578",
    acct: "SOF *1003", tags: ["Commercial"], lastDelivered: "May 30", x: 26.1, y: 80.2, gate: null, notes: "Office reception, 9–5." },
  { id: "1007149", name: "Annie Curtin", address: "246 Bridge Ln", town: "Bridgehampton", phone: "(631) 903-9546",
    acct: "SOF *5003", tags: ["VIP"], lastDelivered: "Jun 6", x: 37.1, y: 83, gate: "2460", notes: "Use the second gate by the hedge." },
];

// ── Today's dispatch — produced by scanning the SPOT manifest photo.
// SPOT rule: on-demand stops are pickup-only; deliveries with invoices are drop-offs.
function todayStops() {
  const plan = [
    { id: "1001902", dropoff: true, pickup: true },   // Meister
    { id: "1012899", dropoff: true, pickup: false },  // Curland
    { id: "1015237", dropoff: false, pickup: true },  // Kaufman (on-demand)
    { id: "1001441", dropoff: true, pickup: true },   // Frank
    { id: "SA5213", dropoff: true, pickup: false },   // Feldman
    { id: "SA6413", dropoff: true, pickup: true },    // Rubin
    { id: "1005425", dropoff: true, pickup: false },  // Geffen
    { id: "1007149", dropoff: false, pickup: true },  // Curtin (on-demand)
  ];
  return plan.map((p, i) => {
    const c = CUSTOMERS.find((x) => x.id === p.id);
    return { ...c, order: i + 1, dropoff: p.dropoff, pickup: p.pickup };
  });
}

// ── Route history (past days) ──
const HISTORY = [
  {
    id: "r-0606", date: "Friday, June 6", label: "Yesterday", driver: "Marcus", van: "Van 1",
    stops: 9, completed: 9, problems: 0, photos: 9, duration: "3h 24m", onTime: "9/9",
    detail: [
      { name: "Doris Meister", town: "East Hampton", arrived: "9:04 AM", completed: "9:12 AM", drop: true, pick: true, photo: true },
      { name: "Wendy Frank", town: "East Hampton", arrived: "9:31 AM", completed: "9:48 AM", drop: true, pick: true, photo: true },
      { name: "Nancy Marks", town: "East Hampton", arrived: "10:06 AM", completed: "10:14 AM", drop: true, pick: false, photo: true },
      { name: "Shirin Kaufman", town: "East Hampton", arrived: "10:38 AM", completed: "10:46 AM", drop: false, pick: true, photo: true },
      { name: "Andrew Goldman", town: "East Hampton", arrived: "11:09 AM", completed: "11:23 AM", drop: true, pick: true, photo: true },
      { name: "Laura Rubin", town: "Sag Harbor", arrived: "11:41 AM", completed: "12:02 PM", drop: true, pick: true, photo: true },
      { name: "Lu Geffen", town: "Sag Harbor", arrived: "12:19 PM", completed: "12:27 PM", drop: true, pick: false, photo: true },
      { name: "Bob Novak", town: "Bridgehampton", arrived: "12:52 PM", completed: "1:05 PM", drop: true, pick: true, photo: true },
      { name: "Annie Curtin", town: "Bridgehampton", arrived: "1:28 PM", completed: "1:36 PM", drop: false, pick: true, photo: true },
    ],
  },
  {
    id: "r-0605", date: "Thursday, June 5", label: "", driver: "Marcus", van: "Van 1",
    stops: 7, completed: 6, problems: 1, photos: 6, duration: "2h 51m", onTime: "6/7",
    detail: [
      { name: "Lauren Feldman", town: "East Hampton", arrived: "9:10 AM", completed: "9:28 AM", drop: true, pick: true, photo: true },
      { name: "Diane Curland", town: "East Hampton", arrived: "9:46 AM", completed: "9:57 AM", drop: true, pick: false, photo: true },
      { name: "Doris Meister", town: "East Hampton", arrived: "10:18 AM", completed: "10:33 AM", drop: true, pick: true, photo: true },
      { name: "Lu Geffen", town: "Sag Harbor", arrived: "—", completed: "Skipped", drop: false, pick: false, photo: false, problem: "Gate code didn't work" },
      { name: "Laura Rubin", town: "Sag Harbor", arrived: "11:24 AM", completed: "11:33 AM", drop: true, pick: true, photo: true },
      { name: "Johanna Kohr", town: "Sag Harbor", arrived: "12:01 PM", completed: "12:10 PM", drop: true, pick: false, photo: true },
      { name: "Sam Poser", town: "Water Mill", arrived: "12:34 PM", completed: "12:45 PM", drop: true, pick: true, photo: true },
    ],
  },
  {
    id: "r-0604", date: "Wednesday, June 4", label: "", driver: "Marcus", van: "Van 1",
    stops: 8, completed: 8, problems: 0, photos: 8, duration: "3h 02m", onTime: "8/8",
    detail: [
      { name: "Diane Curland", town: "East Hampton", arrived: "9:02 AM", completed: "9:14 AM", drop: true, pick: true, photo: true },
      { name: "Doris Meister", town: "East Hampton", arrived: "9:33 AM", completed: "9:42 AM", drop: true, pick: false, photo: true },
      { name: "Wendy Frank", town: "East Hampton", arrived: "10:01 AM", completed: "10:09 AM", drop: true, pick: true, photo: true },
      { name: "Andrew Goldman", town: "East Hampton", arrived: "10:31 AM", completed: "10:39 AM", drop: false, pick: true, photo: true },
      { name: "Laura Rubin", town: "Sag Harbor", arrived: "11:03 AM", completed: "11:12 AM", drop: true, pick: true, photo: true },
      { name: "Bob Novak", town: "Bridgehampton", arrived: "11:34 AM", completed: "11:51 AM", drop: true, pick: true, photo: true },
      { name: "Annie Curtin", town: "Bridgehampton", arrived: "12:18 PM", completed: "12:25 PM", drop: true, pick: false, photo: true },
      { name: "Sam Poser", town: "Water Mill", arrived: "12:49 PM", completed: "1:01 PM", drop: true, pick: true, photo: true },
    ],
  },
];

Object.assign(window, { MIcon, CUSTOMERS, HISTORY, todayStops });
