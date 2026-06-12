// mgr-dispatch.jsx — Today's Dispatch: upload manifest → Claude parses → build/order/send.
// Exports MgrDispatch.
const { useState: useStateD, useRef: useRefD } = React;
const _dp = window.SW;

function MgrDispatch({ isMobile }) {
  // phase: empty | reading | review | dispatched
  const [phase, setPhase] = useStateD("empty");
  const [rows, setRows] = useStateD([]);
  const [sel, setSel] = useStateD(null);

  function startParse() {
    setPhase("reading");
    setTimeout(() => {
      setRows(todayStops().map((s) => ({ ...s, included: true })));
      setPhase("review");
    }, 1700);
  }
  function move(idx, dir) {
    const j = idx + dir;
    const arr = rows.filter((r) => r.included);
    if (j < 0 || j >= arr.length) return;
    const full = [...rows];
    // operate on included ordering
    const ids = arr.map((r) => r.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    const reordered = ids.map((id) => full.find((r) => r.id === id));
    const excluded = full.filter((r) => !r.included);
    setRows([...reordered, ...excluded].map((r, i) => ({ ...r, order: i + 1 })));
  }
  function toggle(id) {
    setRows((arr) => arr.map((r) => (r.id === id ? { ...r, included: !r.included } : r)));
  }

  const included = rows.filter((r) => r.included);
  const drops = included.filter((r) => r.dropoff).length;
  const picks = included.filter((r) => r.pickup).length;

  const pad = isMobile ? 16 : 30;

  // ── EMPTY / UPLOAD ──
  if (phase === "empty" || phase === "reading") {
    return (
      <div style={{ padding: pad, maxWidth: 820, margin: "0 auto" }}>
        <DayHeader isMobile={isMobile} />
        <MCard pad={isMobile ? 24 : 40} style={{ marginTop: 18, textAlign: "center",
          borderStyle: phase === "reading" ? "solid" : "dashed", borderColor: phase === "reading" ? "rgba(2,115,62,0.4)" : _dp.creamDark,
          borderWidth: 1.5, background: phase === "reading" ? "rgba(2,115,62,0.03)" : "#fff" }}>
          {phase === "empty" ? (
            <>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: "rgba(2,115,62,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                <MIcon name="camera" size={30} color={_dp.green} />
              </div>
              <div style={{ fontFamily: _dp.serif, fontSize: 26, fontWeight: 500 }}>Scan today’s SPOT manifest</div>
              <div style={{ fontFamily: _dp.body, fontSize: 14.5, color: "rgba(26,26,26,0.55)", marginTop: 6, maxWidth: 460, marginInline: "auto", lineHeight: 1.5 }}>
                Snap a photo of the printed delivery sheet from SPOT. Claude reads every stop — name, address, phone, drop-off &amp; pick-up — and builds the route for you to review.
              </div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 22, flexWrap: "wrap" }}>
                <button onClick={startParse} style={primaryBtn()}>
                  <MIcon name="camera" size={18} color={_dp.cream} /> Take photo
                </button>
                <button onClick={startParse} style={ghostBtn()}>
                  <MIcon name="customers" size={18} color={_dp.green} /> Choose photo
                </button>
                <button onClick={startParse} style={ghostBtn()}>
                  <MIcon name="file" size={18} color={_dp.green} /> Choose file
                </button>
              </div>
              <div style={{ fontFamily: _dp.body, fontSize: 12, color: "rgba(26,26,26,0.4)", marginTop: 16 }}>
                Photo, PDF, or CSV export from SPOT · last scanned Jun 6, 8:14 AM
              </div>
            </>
          ) : (
            <div style={{ padding: "10px 0" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 18 }}>
                <Spinner />
                <div style={{ fontFamily: _dp.serif, fontSize: 23, fontWeight: 500, color: _dp.green }}>Reading the SPOT manifest…</div>
              </div>
              <div style={{ maxWidth: 440, margin: "0 auto", textAlign: "left", display: "flex", flexDirection: "column", gap: 9 }}>
                <ParseLine done text="Manifest photo received" />
                <ParseLine done text="Read 8 stops from the SPOT sheet" />
                <ParseLine text="Matched to customer accounts…" />
                <ParseLine text="Flagging drop-offs, pick-ups & on-demand" dim />
                <ParseLine text="Ordering the run East → West" dim />
              </div>
            </div>
          )}
        </MCard>

        {phase === "empty" && (
          <MCard style={{ marginTop: 14 }} pad={isMobile ? 16 : 22}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <MIcon name="file" size={17} color="rgba(26,26,26,0.4)" />
                <SectionTitle>Last scanned manifest · Jun 6</SectionTitle>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: _dp.body, fontSize: 12,
                color: _dp.green, fontWeight: 500 }}><MIcon name="check" size={14} color={_dp.green} /> 8 stops read</span>
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: isMobile ? "wrap" : "nowrap" }}>
              {/* faux scanned SPOT sheet */}
              <div style={{ width: isMobile ? "100%" : 150, flexShrink: 0, aspectRatio: "8.5/11", background: "#fff",
                border: `1px solid ${_dp.creamDark}`, borderRadius: 8, padding: "10px 9px", overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.06)", maxHeight: 200 }}>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 6.5, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(26,26,26,0.7)", textAlign: "center" }}>SWEETWATER'S CLEANERS</div>
                <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 5.5, color: "rgba(26,26,26,0.45)", textAlign: "center", marginBottom: 6 }}>DELIVERY MANIFEST · 06/06</div>
                {[["4", "MEISTER, DORIS"], ["5", "CURLAND, DIANE"], ["3", "KAUFMAN, SHIRIN"], ["12", "FRANK, WENDY"], ["16", "FELDMAN, L."], ["19", "RUBIN, LAURA"]].map(([n, nm], i) => (
                  <div key={i} style={{ display: "flex", gap: 5, padding: "3px 0", borderTop: i ? "0.5px solid rgba(26,26,26,0.1)" : "none" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 7, fontWeight: 700, color: _dp.green, width: 10 }}>{n}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 6, color: "rgba(26,26,26,0.7)" }}>{nm}</div>
                      <div style={{ height: 2, background: "rgba(26,26,26,0.1)", borderRadius: 1, marginTop: 2, width: "80%" }} />
                    </div>
                    <div style={{ width: 7, height: 7, border: "0.5px solid rgba(26,26,26,0.3)", borderRadius: 1 }} />
                  </div>
                ))}
              </div>
              {/* what Claude extracted */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <SectionTitle style={{ fontSize: 10, marginBottom: 8 }}>What Claude pulled from it</SectionTitle>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {todayStops().slice(0, 4).map((s) => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, background: _dp.cream, borderRadius: 9, padding: "7px 11px" }}>
                      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 700, color: _dp.green, width: 16 }}>{s.order}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: _dp.body, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                        <div style={{ fontFamily: _dp.body, fontSize: 11, color: "rgba(26,26,26,0.45)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.address} · {s.town}</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        {s.dropoff && <TaskDot drop />}{s.pickup && <TaskDot />}
                      </div>
                    </div>
                  ))}
                  <div style={{ fontFamily: _dp.body, fontSize: 12, color: "rgba(26,26,26,0.4)", paddingLeft: 11 }}>+ 4 more stops</div>
                </div>
              </div>
            </div>
          </MCard>
        )}
      </div>
    );
  }

  // ── REVIEW / DISPATCHED ──
  return (
    <div style={{ padding: pad, maxWidth: 1080, margin: "0 auto" }}>
      <DayHeader isMobile={isMobile} dispatched={phase === "dispatched"} />

      {/* summary strip */}
      <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
        <SummaryStat icon="dispatch" label="Stops" value={included.length} />
        <SummaryStat icon="arrowDown" label="Drop-offs" value={drops} color={_dp.green} />
        <SummaryStat icon="arrowUp" label="Pick-ups" value={picks} color={_dp.goldDark} />
        <SummaryStat icon="truck" label="Driver" value="Marcus · Van 1" wide />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 300px", gap: 16, marginTop: 16, alignItems: "start" }}>
        {/* route list */}
        <MCard pad={0}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px",
            borderBottom: `1px solid ${_dp.creamDark}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <MIcon name="sparkle" size={16} color={_dp.goldDark} />
              <SectionTitle>Route built by Claude · drag to reorder</SectionTitle>
            </div>
            {phase === "review" && (
              <button onClick={() => setRows(todayStops().map((s) => ({ ...s, included: true })))} style={{ background: "none", border: "none",
                cursor: "pointer", fontFamily: _dp.body, fontSize: 12.5, color: _dp.green, fontWeight: 500 }}>Reset order</button>
            )}
          </div>
          <div style={{ padding: "8px 10px" }}>
            {included.map((s, i) => (
              <div key={s.id} onClick={() => setSel(s)} style={{ display: "flex", alignItems: "center", gap: 11,
                padding: "11px 10px", borderRadius: 12, cursor: "pointer",
                background: sel && sel.id === s.id ? "rgba(2,115,62,0.06)" : "transparent" }}>
                {phase === "review" && !isMobile && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); move(i, -1); }} disabled={i === 0} style={arrBtn(i === 0)}>
                      <MIcon name="chevronDown" size={14} color="rgba(26,26,26,0.5)" style={{ transform: "rotate(180deg)" }} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); move(i, 1); }} disabled={i === included.length - 1} style={arrBtn(i === included.length - 1)}>
                      <MIcon name="chevronDown" size={14} color="rgba(26,26,26,0.5)" />
                    </button>
                  </div>
                )}
                <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 14, fontWeight: 600, background: _dp.green, color: _dp.cream }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span style={{ fontFamily: _dp.body, fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                    {s.tags && s.tags.includes("VIP") && <MIcon name="star" size={13} color={_dp.goldDark} />}
                  </div>
                  <div style={{ fontFamily: _dp.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>{s.address} · {s.town}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {s.dropoff && <TaskDot drop />}
                  {s.pickup && <TaskDot />}
                </div>
                {phase === "review" && (
                  <button onClick={(e) => { e.stopPropagation(); toggle(s.id); }} title="Remove from route"
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 4, flexShrink: 0 }}>
                    <MIcon name="x" size={16} color="rgba(26,26,26,0.3)" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* excluded */}
          {rows.some((r) => !r.included) && (
            <div style={{ borderTop: `1px solid ${_dp.creamDark}`, padding: "12px 18px" }}>
              <SectionTitle style={{ marginBottom: 8 }}>Removed</SectionTitle>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {rows.filter((r) => !r.included).map((s) => (
                  <button key={s.id} onClick={() => toggle(s.id)} style={{ display: "inline-flex", alignItems: "center", gap: 6,
                    background: _dp.cream, border: `1px solid ${_dp.creamDark}`, borderRadius: 999, padding: "6px 12px",
                    cursor: "pointer", fontFamily: _dp.body, fontSize: 13, color: "rgba(26,26,26,0.6)" }}>
                    <MIcon name="plus" size={14} color={_dp.green} /> {s.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </MCard>

        {/* map + send */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, position: isMobile ? "static" : "sticky", top: 0 }}>
          <MCard pad={0} style={{ overflow: "hidden" }}>
            <div style={{ position: "relative", height: 220 }}>
              <StreetMap labelRoads={false}>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                  <polyline points={included.map((s) => `${s.x},${s.y}`).join(" ")} fill="none" stroke={_dp.green}
                    strokeOpacity="0.5" strokeWidth="0.9" strokeDasharray="2 1.6" strokeLinecap="round" />
                </svg>
                {included.map((s, i) => (
                  <div key={s.id} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-100%)",
                    zIndex: sel && sel.id === s.id ? 5 : 2 }}>
                    <Pin n={i + 1} active={sel && sel.id === s.id} />
                  </div>
                ))}
              </StreetMap>
            </div>
            <div style={{ padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: _dp.body, fontSize: 13, color: "rgba(26,26,26,0.55)" }}>~14.2 mi · est. 3h 10m</div>
              <div style={{ fontFamily: _dp.body, fontSize: 12.5, color: _dp.green, fontWeight: 600 }}>Optimized</div>
            </div>
          </MCard>

          {phase === "review" ? (
            <MCard>
              <SectionTitle style={{ marginBottom: 12 }}>Assign & send</SectionTitle>
              <div style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", background: _dp.cream,
                borderRadius: 12, marginBottom: 12 }}>
                <Avatar name="Marcus" size={36} bg={_dp.green} fg={_dp.cream} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Marcus</div>
                  <div style={{ fontSize: 12, color: "rgba(26,26,26,0.5)" }}>Van 1 · available</div>
                </div>
                <MIcon name="chevronDown" size={16} color="rgba(26,26,26,0.35)" />
              </div>
              <button onClick={() => setPhase("dispatched")} style={{ ...primaryBtn(), width: "100%" }}>
                <MIcon name="send" size={18} color={_dp.cream} /> Send route to Marcus
              </button>
            </MCard>
          ) : (
            <MCard style={{ borderColor: "rgba(2,115,62,0.4)", background: "rgba(2,115,62,0.04)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", background: _dp.green, display: "flex",
                  alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MIcon name="check" size={24} color={_dp.cream} strokeWidth={2.4} />
                </div>
                <div>
                  <div style={{ fontFamily: _dp.serif, fontSize: 19, fontWeight: 500, color: _dp.green }}>Route dispatched</div>
                  <div style={{ fontFamily: _dp.body, fontSize: 13, color: "rgba(26,26,26,0.55)" }}>Sent to Marcus · {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                </div>
              </div>
              <button onClick={() => { setPhase("review"); }} style={{ ...ghostBtn(), width: "100%", marginTop: 14 }}>
                <MIcon name="edit" size={16} color={_dp.green} /> Edit route
              </button>
            </MCard>
          )}
        </div>
      </div>

      {sel && <StopPeek stop={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

// ── pieces ──
function DayHeader({ isMobile, dispatched }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: _dp.serif, fontSize: isMobile ? 28 : 34, fontWeight: 500, lineHeight: 1.05, whiteSpace: "nowrap" }}>Today’s Dispatch</div>
          {dispatched && <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(2,115,62,0.1)",
            color: _dp.green, borderRadius: 999, padding: "5px 11px", fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: _dp.green }} /> Dispatched</span>}
        </div>
        <div style={{ fontFamily: _dp.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 5 }}>Friday, June 7 · 2025</div>
      </div>
    </div>
  );
}

function SummaryStat({ icon, label, value, color, wide }) {
  return (
    <div style={{ flex: wide ? "2 1 180px" : "1 1 110px", background: "#fff", border: `1px solid ${_dp.creamDark}`,
      borderRadius: 14, padding: "13px 15px", display: "flex", alignItems: "center", gap: 11 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: _dp.cream, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0 }}>
        <MIcon name={icon} size={19} color={color || "rgba(26,26,26,0.55)"} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: _dp.body, fontSize: 18, fontWeight: 700, color: color || _dp.charcoal, lineHeight: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        <div style={{ fontFamily: _dp.body, fontSize: 11.5, color: "rgba(26,26,26,0.45)", letterSpacing: "0.08em",
          textTransform: "uppercase", marginTop: 3 }}>{label}</div>
      </div>
    </div>
  );
}

function StopPeek({ stop, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.4)" }} />
      <MCard style={{ position: "relative", width: 420, maxWidth: "100%" }} pad={22}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ fontFamily: _dp.serif, fontSize: 24, fontWeight: 500 }}>{stop.name}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}><MIcon name="x" size={18} color="rgba(26,26,26,0.4)" /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, color: "rgba(26,26,26,0.55)", fontSize: 14 }}>
          <MIcon name="pin" size={15} color={_dp.green} /> {stop.address}, {stop.town}
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 12 }}>
          {stop.dropoff && <TaskDot drop />}{stop.pickup && <TaskDot />}
          {stop.tags && stop.tags.map((t) => <Tag key={t}>{t}</Tag>)}
        </div>
        {stop.gate && (
          <div style={{ marginTop: 14, background: "rgba(213,154,41,0.1)", border: "1px solid rgba(213,154,41,0.35)",
            borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <MIcon name="key" size={18} color={_dp.goldDark} />
            <div><SectionTitle style={{ color: _dp.goldDark, fontSize: 10 }}>Gate Code</SectionTitle>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.12em" }}>{stop.gate}</div></div>
          </div>
        )}
        <div style={{ marginTop: 12, background: "rgba(2,115,62,0.05)", border: "1px solid rgba(2,115,62,0.18)", borderRadius: 12, padding: "11px 14px" }}>
          <SectionTitle style={{ color: _dp.green, fontSize: 10, marginBottom: 5 }}>Standing Notes</SectionTitle>
          <div style={{ fontSize: 14, lineHeight: 1.45 }}>{stop.notes}</div>
        </div>
      </MCard>
    </div>
  );
}

function ParseLine({ text, done, dim }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: dim ? 0.45 : 1 }}>
      {done ? <div style={{ width: 18, height: 18, borderRadius: "50%", background: _dp.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <MIcon name="check" size={12} color={_dp.cream} strokeWidth={2.6} /></div>
        : <div style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner small /></div>}
      <span style={{ fontFamily: _dp.body, fontSize: 14, color: "rgba(26,26,26,0.7)" }}>{text}</span>
    </div>
  );
}

function Spinner({ small }) {
  const sz = small ? 14 : 22;
  return (
    <div style={{ width: sz, height: sz, borderRadius: "50%", border: `${small ? 2 : 2.5}px solid rgba(2,115,62,0.2)`,
      borderTopColor: _dp.green, animation: "mgrspin 0.7s linear infinite" }} />
  );
}

function primaryBtn() {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 48, padding: "0 22px",
    background: _dp.green, color: _dp.cream, border: "none", borderRadius: 13, cursor: "pointer", fontFamily: _dp.body,
    fontSize: 14.5, fontWeight: 500, letterSpacing: "0.06em" };
}
function ghostBtn() {
  return { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 48, padding: "0 22px",
    background: "transparent", color: _dp.green, border: `1.5px solid ${_dp.green}`, borderRadius: 13, cursor: "pointer",
    fontFamily: _dp.body, fontSize: 14.5, fontWeight: 500, letterSpacing: "0.06em" };
}
function arrBtn(disabled) {
  return { background: "none", border: "none", cursor: disabled ? "default" : "pointer", padding: 1, opacity: disabled ? 0.25 : 1,
    display: "flex", lineHeight: 0 };
}

window.MgrDispatch = MgrDispatch;
