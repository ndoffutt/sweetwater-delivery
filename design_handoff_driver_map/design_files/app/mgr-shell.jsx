// mgr-shell.jsx — responsive app shell: desktop sidebar + mobile bottom tabs.
// Exports MgrShell, and shared UI bits: MCard, Pill, Tag, SectionTitle, Stat, Avatar.
const { useState: useStateSh } = React;
const _sh = window.SW;

const NAV = [
  { id: "dispatch", label: "Dispatch", icon: "dispatch" },
  { id: "customers", label: "Customers", icon: "customers" },
  { id: "history", label: "History", icon: "history" },
  { id: "live", label: "Live", icon: "live" },
  { id: "reports", label: "Reports", icon: "reports" },
];

function MgrShell({ tab, setTab, isMobile, children }) {
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100%",
      background: _sh.cream, fontFamily: _sh.body, color: _sh.charcoal, overflow: "hidden" }}>
      {/* desktop sidebar */}
      {!isMobile && (
        <div style={{ width: 230, flexShrink: 0, background: _sh.green, display: "flex", flexDirection: "column",
          padding: "22px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "0 6px 22px" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", border: `1.5px solid ${_sh.goldLight}`,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: _sh.serif, fontSize: 24, color: _sh.goldLight, fontWeight: 500, lineHeight: 1 }}>S</span>
            </div>
            <div>
              <div style={{ fontFamily: _sh.serif, fontSize: 19, color: _sh.cream, fontWeight: 500, lineHeight: 1 }}>Sweetwater’s</div>
              <div style={{ fontSize: 9.5, letterSpacing: "0.22em", textTransform: "uppercase", color: _sh.goldLight, marginTop: 3 }}>Dispatch Console</div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV.map((n) => {
              const on = tab === n.id;
              return (
                <button key={n.id} onClick={() => setTab(n.id)} style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "11px 13px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                  background: on ? "rgba(255,255,255,0.14)" : "transparent",
                  color: on ? _sh.cream : "rgba(250,247,242,0.7)", transition: "background .15s" }}>
                  <MIcon name={n.icon} size={20} color={on ? _sh.goldLight : "rgba(250,247,242,0.7)"} />
                  <span style={{ fontSize: 14.5, fontWeight: on ? 600 : 400, letterSpacing: "0.02em" }}>{n.label}</span>
                  {n.id === "live" && <span style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%",
                    background: "#5fd08a", boxShadow: "0 0 0 3px rgba(95,208,138,0.25)" }} />}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: "auto", borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14,
            display: "flex", alignItems: "center", gap: 10, padding: "14px 8px 0" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: _sh.goldLight, color: _sh.green,
              display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 }}>D</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, color: _sh.cream, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Diane · Manager</div>
              <div style={{ fontSize: 11, color: "rgba(250,247,242,0.55)" }}>Wainscott shop</div>
            </div>
            <MIcon name="logout" size={17} color="rgba(250,247,242,0.5)" style={{ marginLeft: "auto", flexShrink: 0 }} />
          </div>
        </div>
      )}

      {/* mobile topbar */}
      {isMobile && (
        <div style={{ flexShrink: 0, background: _sh.green, color: _sh.cream, padding: "14px 18px",
          display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: "50%", border: `1.5px solid ${_sh.goldLight}`,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: _sh.serif, fontSize: 20, color: _sh.goldLight, fontWeight: 500, lineHeight: 1 }}>S</span>
          </div>
          <div style={{ fontFamily: _sh.serif, fontSize: 19, fontWeight: 500 }}>{NAV.find((n) => n.id === tab).label}</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(250,247,242,0.7)" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#5fd08a" }} /> Live
          </div>
        </div>
      )}

      {/* content */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "auto", paddingBottom: isMobile ? 76 : 0 }}>
        {children}
      </div>

      {/* mobile bottom tabs */}
      {isMobile && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "#fff",
          borderTop: `1px solid ${_sh.creamDark}`, display: "flex", padding: "8px 6px 22px", zIndex: 20 }}>
          {NAV.map((n) => {
            const on = tab === n.id;
            return (
              <button key={n.id} onClick={() => setTab(n.id)} style={{ flex: 1, display: "flex", flexDirection: "column",
                alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", padding: "4px 0" }}>
                <MIcon name={n.icon} size={22} color={on ? _sh.green : "rgba(26,26,26,0.4)"} />
                <span style={{ fontSize: 10.5, fontWeight: on ? 600 : 400, color: on ? _sh.green : "rgba(26,26,26,0.45)",
                  letterSpacing: "0.02em" }}>{n.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── shared presentational bits ──
function MCard({ children, style, pad = 18, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "#fff", border: `1px solid ${_sh.creamDark}`, borderRadius: 16,
      padding: pad, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>
  );
}

function SectionTitle({ children, style }) {
  return <div style={{ fontFamily: _sh.body, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.18em",
    textTransform: "uppercase", color: "rgba(26,26,26,0.42)", ...style }}>{children}</div>;
}

function Tag({ children }) {
  const map = {
    VIP: { bg: "rgba(213,154,41,0.16)", fg: _sh.goldDark, icon: "star" },
    Seasonal: { bg: "rgba(2,115,62,0.1)", fg: _sh.green },
    Commercial: { bg: "rgba(26,26,26,0.07)", fg: "rgba(26,26,26,0.6)" },
  };
  const t = map[children] || map.Commercial;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: t.bg, color: t.fg,
      borderRadius: 999, padding: "3px 9px", fontFamily: _sh.body, fontSize: 11, fontWeight: 600,
      letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {t.icon && <MIcon name={t.icon} size={11} color={t.fg} />}{children}
    </span>
  );
}

function TaskDot({ drop }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap",
      background: drop ? "rgba(2,115,62,0.08)" : "rgba(213,154,41,0.14)", color: drop ? _sh.green : _sh.goldDark,
      borderRadius: 7, padding: "3px 8px", fontFamily: _sh.body, fontSize: 11.5, fontWeight: 500 }}>
      <MIcon name={drop ? "arrowDown" : "arrowUp"} size={13} color={drop ? _sh.green : _sh.goldDark} />
      {drop ? "Drop-off" : "Pick-up"}
    </span>
  );
}

function Avatar({ name, size = 34, bg, fg }) {
  const initials = name.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: bg || _sh.creamDark,
      color: fg || _sh.green, display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: _sh.serif, fontSize: size * 0.42, fontWeight: 600 }}>{initials}</div>
  );
}

Object.assign(window, { MgrShell, MCard, SectionTitle, Tag, TaskDot, Avatar, NAV });
