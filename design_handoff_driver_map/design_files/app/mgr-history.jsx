// mgr-history.jsx — Route History: past days, per-stop timestamps, photo proof.
// Exports MgrHistory.
const { useState: useStateH } = React;
const _hi = window.SW;

function MgrHistory({ isMobile }) {
  const [openId, setOpenId] = useStateH("r-0606");
  const [photo, setPhoto] = useStateH(null);
  const pad = isMobile ? 16 : 30;

  return (
    <div style={{ padding: pad, maxWidth: 920, margin: "0 auto" }}>
      <div style={{ fontFamily: _hi.serif, fontSize: isMobile ? 28 : 34, fontWeight: 500 }}>Route History</div>
      <div style={{ fontFamily: _hi.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 5 }}>Every completed route, with timestamps and photo proof.</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 20 }}>
        {HISTORY.map((r) => {
          const open = r.id === openId;
          return (
            <MCard key={r.id} pad={0} style={{ overflow: "hidden" }}>
              {/* summary row */}
              <button onClick={() => setOpenId(open ? null : r.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer",
                background: "none", border: "none", padding: isMobile ? "15px 16px" : "18px 22px", display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: _hi.cream, flexShrink: 0,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: _hi.green }}>{r.date.split(" ")[2]}</span>
                  <span style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(26,26,26,0.45)" }}>{r.date.split(" ")[1].slice(0, 3)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: _hi.serif, fontSize: 19, fontWeight: 500, whiteSpace: "nowrap" }}>{r.date}</span>
                    {r.label && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
                      color: _hi.goldDark, background: "rgba(213,154,41,0.14)", borderRadius: 999, padding: "2px 8px" }}>{r.label}</span>}
                  </div>
                  <div style={{ fontFamily: _hi.body, fontSize: 13, color: "rgba(26,26,26,0.5)", marginTop: 3 }}>
                    {r.driver} · {r.van} · {r.duration}
                  </div>
                </div>
                {!isMobile && (
                  <div style={{ display: "flex", gap: 18, flexShrink: 0, marginRight: 6 }}>
                    <MiniStat value={`${r.completed}/${r.stops}`} label="Done" good={r.completed === r.stops} />
                    <MiniStat value={r.onTime} label="On time" />
                    <MiniStat value={r.photos} label="Photos" />
                    {r.problems > 0 && <MiniStat value={r.problems} label="Flagged" warn />}
                  </div>
                )}
                <MIcon name="chevronDown" size={20} color="rgba(26,26,26,0.35)" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
              </button>

              {/* expanded timeline */}
              {open && (
                <div style={{ borderTop: `1px solid ${_hi.creamDark}`, padding: isMobile ? "8px 14px 16px" : "10px 22px 20px" }}>
                  {isMobile && (
                    <div style={{ display: "flex", gap: 16, padding: "10px 4px 14px" }}>
                      <MiniStat value={`${r.completed}/${r.stops}`} label="Done" good={r.completed === r.stops} />
                      <MiniStat value={r.onTime} label="On time" />
                      <MiniStat value={r.photos} label="Photos" />
                      {r.problems > 0 && <MiniStat value={r.problems} label="Flagged" warn />}
                    </div>
                  )}
                  <div style={{ position: "relative" }}>
                    {/* vertical line */}
                    <div style={{ position: "absolute", left: 14, top: 14, bottom: 14, width: 2, background: _hi.creamDark }} />
                    {r.detail.map((s, i) => {
                      const skipped = !!s.problem;
                      return (
                        <div key={i} style={{ position: "relative", display: "flex", gap: 14, padding: "10px 0" }}>
                          <div style={{ width: 30, display: "flex", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: skipped ? "rgba(213,154,41,0.16)" : _hi.green,
                              display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                              {skipped ? <MIcon name="alert" size={15} color={_hi.goldDark} /> : <MIcon name="check" size={15} color={_hi.cream} strokeWidth={2.6} />}
                            </div>
                          </div>
                          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <div style={{ fontFamily: _hi.body, fontSize: 14.5, fontWeight: 500 }}>{s.name}</div>
                              <div style={{ fontFamily: _hi.body, fontSize: 12, color: "rgba(26,26,26,0.45)" }}>{s.town}</div>
                              {skipped && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 4,
                                fontSize: 12, color: _hi.goldDark }}><MIcon name="alert" size={13} color={_hi.goldDark} /> {s.problem}</div>}
                            </div>
                            {!skipped && (
                              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                                <div style={{ textAlign: "right" }}>
                                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                                    {s.drop && <TaskDot drop />}{s.pick && <TaskDot />}
                                  </div>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, justifyContent: "flex-end",
                                    fontFamily: _hi.body, fontSize: 12.5, color: "rgba(26,26,26,0.55)" }}>
                                    <MIcon name="clock" size={13} color="rgba(26,26,26,0.4)" />
                                    <span>{s.arrived}</span><span style={{ opacity: 0.4 }}>→</span><span style={{ fontWeight: 600, color: _hi.green }}>{s.completed}</span>
                                  </div>
                                </div>
                                {s.photo && (
                                  <button onClick={() => setPhoto(s)} style={{ width: 50, height: 50, borderRadius: 10, flexShrink: 0,
                                    background: `repeating-linear-gradient(135deg, ${_hi.creamDark}, ${_hi.creamDark} 6px, #e6dfd2 6px, #e6dfd2 12px)`,
                                    border: `1px solid ${_hi.creamDark}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                                    <MIcon name="camera" size={18} color="rgba(26,26,26,0.4)" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button style={{ ...histGhost(), marginTop: 12 }}><MIcon name="download" size={15} color={_hi.green} /> Export day (PDF)</button>
                </div>
              )}
            </MCard>
          );
        })}
      </div>

      {photo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={() => setPhoto(null)} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.55)" }} />
          <div style={{ position: "relative", width: 380, maxWidth: "100%" }}>
            <div style={{ aspectRatio: "4/3", borderRadius: 16, overflow: "hidden",
              background: `repeating-linear-gradient(135deg, ${_hi.creamDark}, ${_hi.creamDark} 10px, #e6dfd2 10px, #e6dfd2 20px)`,
              display: "flex", alignItems: "center", justifyContent: "center", border: "3px solid #fff" }}>
              <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, letterSpacing: "0.1em", color: "rgba(26,26,26,0.4)", textTransform: "uppercase" }}>delivery photo</span>
            </div>
            <div style={{ background: "#fff", borderRadius: 14, padding: "14px 16px", marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <MIcon name="camera" size={18} color={_hi.green} />
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: _hi.body, fontSize: 14.5, fontWeight: 600 }}>{photo.name}</div>
                <div style={{ fontFamily: _hi.body, fontSize: 12.5, color: "rgba(26,26,26,0.5)" }}>Captured {photo.completed} · {photo.town}</div>
              </div>
              <button onClick={() => setPhoto(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><MIcon name="x" size={18} color="rgba(26,26,26,0.4)" /></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ value, label, good, warn }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: _hi.body, fontSize: 16, fontWeight: 700, color: warn ? _hi.goldDark : good ? _hi.green : _hi.charcoal, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: _hi.body, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(26,26,26,0.42)", marginTop: 4 }}>{label}</div>
    </div>
  );
}
function histGhost() {
  return { display: "inline-flex", alignItems: "center", gap: 7, background: "transparent", color: _hi.green,
    border: `1.5px solid ${_hi.creamDark}`, borderRadius: 11, padding: "9px 15px", cursor: "pointer", fontFamily: _hi.body, fontSize: 13, fontWeight: 500 };
}

window.MgrHistory = MgrHistory;
