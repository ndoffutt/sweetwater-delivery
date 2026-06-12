// mgr-extra.jsx — Live tracking + Reports. Exports MgrLive, MgrReports.
const _ex = window.SW;

function MgrLive({ isMobile }) {
  const stops = todayStops();
  const doneCount = 3, currentIdx = 3;
  const pad = isMobile ? 16 : 30;
  const driver = stops[currentIdx];

  return (
    <div style={{ padding: pad, height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: _ex.serif, fontSize: isMobile ? 28 : 34, fontWeight: 500, whiteSpace: "nowrap" }}>Live Tracking</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 6, fontFamily: _ex.body, fontSize: 13.5, color: "rgba(26,26,26,0.55)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#5fd08a", boxShadow: "0 0 0 3px rgba(95,208,138,0.3)" }} />
            Marcus · Van 1 · on stop {currentIdx + 1} of {stops.length}
          </div>
        </div>
        <button style={callBtn()}><MIcon name="phone" size={16} color={_ex.cream} /> Call driver</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 320px", gap: 16, marginTop: 18, flex: 1, minHeight: 0 }}>
        <MCard pad={0} style={{ overflow: "hidden", minHeight: isMobile ? 320 : 0, position: "relative" }}>
          <StreetMap>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <polyline points={stops.map((s) => `${s.x},${s.y}`).join(" ")} fill="none" stroke={_ex.green}
                strokeOpacity="0.45" strokeWidth="0.8" strokeDasharray="2 1.6" strokeLinecap="round" />
            </svg>
            {stops.map((s, i) => (
              <div key={s.id} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-100%)", zIndex: i === currentIdx ? 5 : 2 }}>
                <Pin n={i + 1} done={i < doneCount} active={i === currentIdx} />
              </div>
            ))}
            <div style={{ position: "absolute", left: `${driver.x}%`, top: `${driver.y - 6}%`, transform: "translate(-50%,-50%)", zIndex: 8 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#2a7de1", border: "3px solid #fff", boxShadow: "0 0 0 7px rgba(42,125,225,0.18)" }} />
              <div style={{ position: "absolute", top: -32, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap",
                background: _ex.charcoal, color: _ex.cream, fontSize: 11.5, fontWeight: 500, padding: "5px 10px", borderRadius: 8 }}>Marcus</div>
            </div>
          </StreetMap>
        </MCard>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
          <MCard style={{ borderColor: "rgba(2,115,62,0.35)", background: "rgba(2,115,62,0.04)" }}>
            <SectionTitle style={{ marginBottom: 8 }}>Currently at</SectionTitle>
            <div style={{ fontFamily: _ex.serif, fontSize: 21, fontWeight: 500 }}>{driver.name}</div>
            <div style={{ fontFamily: _ex.body, fontSize: 13, color: "rgba(26,26,26,0.5)", marginTop: 2 }}>{driver.address} · {driver.town}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontFamily: _ex.body, fontSize: 12.5, color: _ex.green }}>
              <MIcon name="clock" size={14} color={_ex.green} /> Arrived 10:42 AM · on site 4 min
            </div>
          </MCard>
          <MCard pad={0} style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <SectionTitle style={{ padding: "14px 16px 8px" }}>Route progress</SectionTitle>
            {stops.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 16px" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11.5, fontWeight: 600, background: i < doneCount ? _ex.green : i === currentIdx ? _ex.gold : _ex.creamDark,
                  color: i < doneCount ? _ex.cream : i === currentIdx ? _ex.charcoal : "rgba(26,26,26,0.5)" }}>
                  {i < doneCount ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontFamily: _ex.body, fontSize: 13.5, fontWeight: i === currentIdx ? 600 : 400,
                  color: i < doneCount ? "rgba(26,26,26,0.45)" : _ex.charcoal, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                {i < doneCount && <span style={{ fontFamily: _ex.body, fontSize: 11.5, color: "rgba(26,26,26,0.4)", flexShrink: 0 }}>{["9:12", "9:48", "10:14"][i]}</span>}
                {i === currentIdx && <span style={{ fontFamily: _ex.body, fontSize: 11, fontWeight: 600, color: _ex.goldDark, flexShrink: 0 }}>NOW</span>}
              </div>
            ))}
          </MCard>
        </div>
      </div>
    </div>
  );
}

function MgrReports({ isMobile }) {
  const pad = isMobile ? 16 : 30;
  const weekBars = [
    { d: "May 5", v: 38 }, { d: "May 12", v: 41 }, { d: "May 19", v: 36 }, { d: "May 26", v: 44 }, { d: "Jun 2", v: 42 },
  ];
  const max = 44;
  return (
    <div style={{ padding: pad, maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: _ex.serif, fontSize: isMobile ? 28 : 34, fontWeight: 500 }}>Reports</div>
      <div style={{ fontFamily: _ex.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 5 }}>This week · Jun 2–8</div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(3, 1fr)", gap: 12, marginTop: 20 }}>
        <BigStat value="42" label="Stops this week" icon="check" accent={_ex.green} />
        <BigStat value="42" label="Photos captured" icon="camera" />
        <BigStat value="1" label="Flagged stops" icon="alert" accent={_ex.goldDark} />
      </div>

      <MCard style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <SectionTitle>Stops per week</SectionTitle>
          <span style={{ fontFamily: _ex.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>last 5 weeks</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: isMobile ? 8 : 18, height: 160, paddingBottom: 4 }}>
          {weekBars.map((b) => (
            <div key={b.d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, height: "100%", justifyContent: "flex-end" }}>
              <div style={{ fontFamily: _ex.body, fontSize: 13, fontWeight: 600, color: b.v ? _ex.green : "rgba(26,26,26,0.3)" }}>{b.v || "–"}</div>
              <div style={{ width: "100%", maxWidth: 42, height: `${(b.v / max) * 100}%`, minHeight: b.v ? 6 : 0,
                background: b.v ? `linear-gradient(to top, ${_ex.green}, ${_ex.greenLight})` : "transparent", borderRadius: "7px 7px 0 0" }} />
              <div style={{ fontFamily: _ex.body, fontSize: 12, color: "rgba(26,26,26,0.45)", letterSpacing: "0.04em" }}>{b.d}</div>
            </div>
          ))}
        </div>
      </MCard>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginTop: 16 }}>
        <MCard>
          <SectionTitle style={{ marginBottom: 14 }}>Busiest customers</SectionTitle>
          {[["Doris Meister", 5], ["Wendy Frank", 4], ["Laura Rubin", 4], ["Annie Curtin", 3]].map(([n, c], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderTop: i ? `1px solid ${_ex.creamDark}` : "none" }}>
              <Avatar name={n} size={32} />
              <div style={{ flex: 1, fontFamily: _ex.body, fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n}</div>
              <span style={{ fontFamily: _ex.body, fontSize: 13, fontWeight: 600, color: _ex.green }}>{c} visits</span>
            </div>
          ))}
        </MCard>
        <MCard>
          <SectionTitle style={{ marginBottom: 14 }}>By town</SectionTitle>
          {[["East Hampton", 18], ["Sag Harbor", 14], ["Bridgehampton", 5], ["Sagaponack", 3], ["Water Mill", 2]].map(([n, c], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0" }}>
              <div style={{ width: 110, fontFamily: _ex.body, fontSize: 13.5 }}>{n}</div>
              <div style={{ flex: 1, height: 8, background: _ex.cream, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c / 18) * 100}%`, background: _ex.green, borderRadius: 999 }} />
              </div>
              <span style={{ fontFamily: _ex.body, fontSize: 12.5, fontWeight: 600, color: "rgba(26,26,26,0.55)", width: 20, textAlign: "right" }}>{c}</span>
            </div>
          ))}
        </MCard>
      </div>
    </div>
  );
}

function callBtn() {
  return { display: "inline-flex", alignItems: "center", gap: 8, background: _ex.green, color: _ex.cream, border: "none",
    borderRadius: 12, padding: "10px 18px", cursor: "pointer", fontFamily: _ex.body, fontSize: 13.5, fontWeight: 500, letterSpacing: "0.04em" };
}

function BigStat({ value, label, icon, accent }) {
  return (
    <MCard pad={16}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: _ex.serif, fontSize: 36, fontWeight: 600, color: accent || _ex.charcoal, lineHeight: 1 }}>{value}</div>
        <MIcon name={icon} size={20} color={accent || "rgba(26,26,26,0.3)"} />
      </div>
      <div style={{ fontFamily: _ex.body, fontSize: 12.5, color: "rgba(26,26,26,0.5)", marginTop: 8 }}>{label}</div>
    </MCard>
  );
}

Object.assign(window, { MgrLive, MgrReports });
