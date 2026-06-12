// driver-clean.jsx — Direction A: "The Clean List"
// A polished, list-first driver flow. Exports <DriverClean/> to window.
const { useState, useRef, useEffect } = React;

// shorthand
const _sw = window.SW;

// ── tiny building blocks ───────────────────────────────────────
function Label({ children, color, style }) {
  return (
    <div style={{
      fontFamily: _sw.body, fontSize: 11, fontWeight: 500, letterSpacing: "0.22em",
      textTransform: "uppercase", color: color || "rgba(26,26,26,0.45)", ...style,
    }}>{children}</div>
  );
}

function BigButton({ children, onClick, variant = "green", disabled, icon, style }) {
  const palette = {
    green: { bg: _sw.green, fg: _sw.cream, bd: _sw.green },
    gold: { bg: _sw.gold, fg: _sw.charcoal, bd: _sw.gold },
    ghost: { bg: "transparent", fg: _sw.green, bd: _sw.green },
  }[variant];
  return (
    <button onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      width: "100%", minHeight: 60, border: `1.5px solid ${disabled ? "rgba(26,26,26,0.12)" : palette.bd}`,
      background: disabled ? "rgba(26,26,26,0.05)" : palette.bg,
      color: disabled ? "rgba(26,26,26,0.3)" : palette.fg,
      borderRadius: 16, fontFamily: _sw.body, fontSize: 15, fontWeight: 500,
      letterSpacing: "0.16em", textTransform: "uppercase", cursor: disabled ? "default" : "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
      transition: "transform .12s, opacity .12s", WebkitTapHighlightColor: "transparent",
      ...style,
    }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.985)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
      {icon && <Icon name={icon} size={20} color={disabled ? "rgba(26,26,26,0.3)" : palette.fg} />}
      {children}
    </button>
  );
}

function TaskBadge({ type, bags }) {
  const drop = type === "drop";
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap",
      background: drop ? "rgba(2,115,62,0.08)" : "rgba(213,154,41,0.14)",
      color: drop ? _sw.green : _sw.goldDark,
      borderRadius: 8, padding: "4px 9px", fontFamily: _sw.body, fontSize: 12.5, fontWeight: 500,
    }}>
      <Icon name={drop ? "arrowDown" : "arrowUp"} size={14} />
      {drop ? "Drop-off" : "Pick-up"}
    </span>
  );
}

// striped photo placeholder used after a "capture"
function PhotoThumb({ onRemove }) {
  return (
    <div style={{
      position: "relative", aspectRatio: "4/3", borderRadius: 12, overflow: "hidden",
      background: `repeating-linear-gradient(135deg, ${_sw.creamDark}, ${_sw.creamDark} 8px, #e6dfd2 8px, #e6dfd2 16px)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      border: `1px solid ${_sw.creamDark}`,
    }}>
      <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10.5, letterSpacing: "0.1em",
        color: "rgba(26,26,26,0.4)", textTransform: "uppercase" }}>delivery photo</span>
      <div style={{ position: "absolute", top: 6, right: 6, background: _sw.green, color: _sw.cream,
        borderRadius: 999, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="check" size={13} color={_sw.cream} strokeWidth={2.6} />
      </div>
    </div>
  );
}

// ── header ─────────────────────────────────────────────────────
function GreenHeader({ title, sub, onBack, right }) {
  return (
    <div style={{
      background: _sw.green, color: _sw.cream, paddingTop: _sw.safeTop,
      paddingBottom: 14, paddingLeft: 16, paddingRight: 16,
      display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.12)", border: "none",
            borderRadius: 12, width: 40, height: 40, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", flexShrink: 0, marginLeft: -4 }}>
            <Icon name="back" size={20} color={_sw.cream} />
          </button>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: _sw.serif, fontSize: 22, fontWeight: 500, lineHeight: 1.05,
            whiteSpace: "nowrap" }}>{title}</div>
          {sub && <Label color={_sw.goldLight} style={{ marginTop: 2, fontSize: 10 }}>{sub}</Label>}
        </div>
      </div>
      {right}
    </div>
  );
}

function SyncChip({ offline }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6,
      background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "6px 11px",
      fontFamily: _sw.body, fontSize: 11.5, color: _sw.cream, whiteSpace: "nowrap" }}>
      <Icon name={offline ? "cloud" : "cloudCheck"} size={15} color={offline ? _sw.goldLight : _sw.cream} />
      {offline ? "Offline" : "Synced"}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
function DriverClean() {
  const [screen, setScreen] = useState("login"); // login | route | stop
  const [stops, setStops] = useState(() => makeStops().map((s) => ({
    ...s, status: "pending", dropDone: false, pickDone: false, photo: false,
  })));
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState("list"); // list | map
  const [offline, setOffline] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [problemFor, setProblemFor] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }
  function patch(id, fields) {
    setStops((arr) => arr.map((s) => (s.id === id ? { ...s, ...fields } : s)));
  }

  const sel = stops.find((s) => s.id === selId);
  const remaining = stops.filter((s) => s.status === "pending" || s.status === "arrived");
  const finished = stops.filter((s) => s.status === "done" || s.status === "problem");
  const next = remaining[0];
  const progress = finished.length;
  const allDone = remaining.length === 0;

  const firstName = (n) => n.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "").split(" ")[0].replace(/[^A-Za-z].*$/, "");

  function openStop(id) { setSelId(id); setScreen("stop"); }
  function arrive(s) {
    patch(s.id, { status: "arrived" });
    flash(`✓ Texted ${firstName(s.name)} — “On our way”`);
  }
  function complete(s) {
    patch(s.id, { status: "done" });
    flash(`✓ Delivered — ${firstName(s.name)} notified`);
    setScreen("route");
  }
  function resolveProblem(reason) {
    patch(problemFor.id, { status: "problem", problem: reason });
    flash("Dispatch notified");
    setProblemFor(null);
    setScreen("route");
  }

  // ── LOGIN ──────────────────────────────────────────────────
  if (screen === "login") {
    return (
      <Frame sbDark={false}>
        <div style={{ height: "100%", background: _sw.cream, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "0 32px", position: "relative" }}>
          <div style={{ position: "absolute", top: _sw.safeTop + 6, left: 0, right: 0,
            display: "flex", justifyContent: "center" }}>
            <Label style={{ color: "rgba(26,26,26,0.35)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </Label>
          </div>
          {/* monogram */}
          <div style={{ width: 84, height: 84, borderRadius: "50%", border: `1.5px solid ${_sw.green}`,
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
            <span style={{ fontFamily: _sw.serif, fontSize: 46, color: _sw.green, fontWeight: 500, lineHeight: 1 }}>S</span>
          </div>
          <div style={{ fontFamily: _sw.serif, fontSize: 40, color: _sw.charcoal, fontWeight: 500, lineHeight: 1 }}>
            Sweetwater’s
          </div>
          <Label color={_sw.goldDark} style={{ marginTop: 8, fontSize: 12 }}>Delivery · Driver</Label>

          <div style={{ width: "100%", marginTop: 48 }}>
            <BigButton variant="green" icon="nav" onClick={() => setScreen("route")}>Start Driving</BigButton>
            <button onClick={() => flash("Manager login is on the dispatch view")} style={{ display: "block", margin: "20px auto 0",
              background: "none", border: "none", cursor: "pointer", fontFamily: _sw.body, fontSize: 12,
              letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)" }}>
              Manager Login →
            </button>
          </div>
          <div style={{ position: "absolute", bottom: 44, display: "flex", alignItems: "center", gap: 7,
            fontFamily: _sw.body, fontSize: 12, color: "rgba(26,26,26,0.4)" }}>
            <Icon name="cloudCheck" size={16} color={_sw.green} /> 8 stops ready · synced
          </div>
        </div>
        <Toast toast={toast} />
      </Frame>
    );
  }

  // ── STOP DETAIL ────────────────────────────────────────────
  if (screen === "stop" && sel) {
    const needDrop = sel.dropoff && !sel.dropDone;
    const needPick = sel.pickup && !sel.pickDone;
    const canComplete = sel.photo && !needDrop && !needPick;
    return (
      <Frame>
        <div style={{ display: "flex", flexDirection: "column", height: "100%", background: _sw.cream }}>
          <GreenHeader title={`Stop ${sel.order} of ${stops.length}`} sub={sel.town}
            onBack={() => setScreen("route")} right={<SyncChip offline={offline} />} />
          <div style={{ flex: 1, overflow: "auto", padding: "16px 16px 120px" }}>
            {/* customer card */}
            <div style={{ background: "#fff", borderRadius: 18, padding: 18, border: `1px solid ${_sw.creamDark}` }}>
              <div style={{ fontFamily: _sw.serif, fontSize: 30, fontWeight: 500, color: _sw.charcoal, lineHeight: 1.05 }}>
                {sel.name}
              </div>
              <a href={mapsHref(sel)} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 8, color: _sw.green, fontFamily: _sw.body, fontSize: 15, textDecoration: "none", whiteSpace: "nowrap" }}>
                <Icon name="pin" size={16} color={_sw.green} /> {sel.address}, {sel.town}
              </a>
              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                {sel.dropoff && <TaskBadge type="drop" bags={sel.dropBags} />}
                {sel.pickup && <TaskBadge type="pick" bags={sel.pickBags} />}
              </div>
            </div>

            {/* gate code — prominent */}
            {sel.gate && (
              <div style={{ marginTop: 12, background: "rgba(213,154,41,0.1)", border: `1px solid rgba(213,154,41,0.4)`,
                borderRadius: 14, padding: "13px 16px", display: "flex", alignItems: "center", gap: 13 }}>
                <Icon name="key" size={22} color={_sw.goldDark} />
                <div>
                  <Label color={_sw.goldDark} style={{ whiteSpace: "nowrap" }}>Gate Code</Label>
                  <div style={{ fontFamily: _sw.body, fontSize: 26, fontWeight: 600, color: _sw.charcoal,
                    letterSpacing: "0.14em", marginTop: 1 }}>{sel.gate}</div>
                </div>
              </div>
            )}

            {/* notes */}
            {sel.notes && (
              <div style={{ marginTop: 12, background: "rgba(2,115,62,0.05)", border: `1px solid rgba(2,115,62,0.18)`,
                borderRadius: 14, padding: "13px 16px" }}>
                <Label color={_sw.green}>Delivery Notes</Label>
                <div style={{ fontFamily: _sw.body, fontSize: 15, color: _sw.charcoal, marginTop: 5, lineHeight: 1.45 }}>
                  {sel.notes}
                </div>
              </div>
            )}

            {/* tap to call */}
            <a href="#" onClick={(e) => { e.preventDefault(); flash(`Calling ${firstName(sel.name)}…`); }}
              style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 11, background: "#fff",
                border: `1px solid ${_sw.creamDark}`, borderRadius: 14, padding: "13px 16px", textDecoration: "none" }}>
              <Icon name="phone" size={20} color={_sw.green} />
              <div style={{ fontFamily: _sw.body, fontSize: 15, color: _sw.charcoal }}>{sel.phone}</div>
              <span style={{ marginLeft: "auto", fontFamily: _sw.body, fontSize: 12, letterSpacing: "0.14em",
                textTransform: "uppercase", color: "rgba(26,26,26,0.35)" }}>Call</span>
            </a>

            {/* ── ARRIVED: tasks + photo ── */}
            {sel.status === "arrived" && (
              <div style={{ marginTop: 18 }}>
                <Label style={{ marginBottom: 10, marginLeft: 2 }}>Confirm what you did here</Label>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sel.dropoff && (
                    <CheckRow label="Dropped off" icon="arrowDown"
                      checked={sel.dropDone} onClick={() => patch(sel.id, { dropDone: !sel.dropDone })} />
                  )}
                  {sel.pickup && (
                    <CheckRow label="Picked up" icon="arrowUp"
                      checked={sel.pickDone} onClick={() => patch(sel.id, { pickDone: !sel.pickDone })} />
                  )}
                </div>

                <div style={{ marginTop: 16 }}>
                  <Label style={{ marginBottom: 10, marginLeft: 2 }}>
                    Photo proof <span style={{ color: sel.photo ? _sw.green : _sw.goldDark }}>· required</span>
                  </Label>
                  {sel.photo ? (
                    <PhotoThumb />
                  ) : (
                    <button onClick={() => patch(sel.id, { photo: true })} style={{ width: "100%", aspectRatio: "5/2",
                      borderRadius: 14, border: `1.5px dashed rgba(2,115,62,0.4)`, background: "rgba(2,115,62,0.04)",
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
                      cursor: "pointer" }}>
                      <Icon name="camera" size={30} color={_sw.green} />
                      <span style={{ fontFamily: _sw.body, fontSize: 14, letterSpacing: "0.14em",
                        textTransform: "uppercase", color: _sw.green }}>Take Photo</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* sticky action dock */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 16px 30px",
            background: "linear-gradient(to top, rgba(250,247,242,1) 60%, rgba(250,247,242,0))" }}>
            {sel.status === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <BigButton variant="gold" icon="nav" onClick={() => window.open(mapsHref(sel), "_blank")} style={{ flex: 1 }}>Navigate</BigButton>
                </div>
                <BigButton variant="green" onClick={() => arrive(sel)}>I’m Here →</BigButton>
                <button onClick={() => setProblemFor(sel)} style={{ background: "none", border: "none", cursor: "pointer",
                  fontFamily: _sw.body, fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "rgba(26,26,26,0.4)", padding: 6 }}>Problem at this stop</button>
              </div>
            )}
            {sel.status === "arrived" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <BigButton variant="green" icon="check" disabled={!canComplete} onClick={() => complete(sel)}>
                  Complete Stop
                </BigButton>
                {!canComplete && (
                  <div style={{ textAlign: "center", fontFamily: _sw.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>
                    {!sel.photo ? "Snap a photo to finish" : "Confirm the tasks above"}
                  </div>
                )}
                <button onClick={() => setProblemFor(sel)} style={{ background: "none", border: "none", cursor: "pointer",
                  fontFamily: _sw.body, fontSize: 12.5, letterSpacing: "0.12em", textTransform: "uppercase",
                  color: "rgba(26,26,26,0.4)", padding: 6 }}>Problem at this stop</button>
              </div>
            )}
          </div>
        </div>
        {problemFor && <ProblemSheet name={firstName(problemFor.name)} onClose={() => setProblemFor(null)} onResolve={resolveProblem} />}
        <Toast toast={toast} />
      </Frame>
    );
  }

  // ── ROUTE HOME ─────────────────────────────────────────────
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: _sw.cream }}>
        <GreenHeader title="Sweetwater’s" sub="Delivery"
          right={<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <SyncChip offline={offline} />
          </div>} />

        {/* today bar */}
        <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${_sw.creamDark}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <div style={{ fontFamily: _sw.body, fontSize: 13.5, color: "rgba(26,26,26,0.55)" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </div>
            <div style={{ display: "flex", background: _sw.creamDark, borderRadius: 999, padding: 3 }}>
              {["list", "map"].map((v) => (
                <button key={v} onClick={() => setView(v)} style={{ border: "none", cursor: "pointer",
                  borderRadius: 999, padding: "5px 14px", fontFamily: _sw.body, fontSize: 12, fontWeight: 500,
                  letterSpacing: "0.1em", textTransform: "uppercase",
                  background: view === v ? "#fff" : "transparent", color: view === v ? _sw.green : "rgba(26,26,26,0.45)",
                  boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>{v}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, height: 7, background: _sw.creamDark, borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(progress / stops.length) * 100}%`, background: _sw.green,
                borderRadius: 999, transition: "width .3s" }} />
            </div>
            <div style={{ fontFamily: _sw.body, fontSize: 13.5, fontWeight: 600, color: _sw.green, whiteSpace: "nowrap" }}>
              {progress}/{stops.length} stops
            </div>
          </div>
        </div>

        {/* offline banner */}
        {offline && (
          <div style={{ margin: "10px 16px 0", background: "rgba(213,154,41,0.12)", border: `1px solid rgba(213,154,41,0.35)`,
            borderRadius: 12, padding: "10px 13px", display: "flex", alignItems: "center", gap: 9 }}>
            <Icon name="cloud" size={18} color={_sw.goldDark} />
            <div style={{ fontFamily: _sw.body, fontSize: 13, color: _sw.charcoal }}>
              Working offline — {finished.length} update{finished.length === 1 ? "" : "s"} will sync when you’re back.
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px 28px" }}>
          {view === "map" ? (
            <MiniMap stops={stops} nextId={next?.id} onPick={openStop} />
          ) : (
            <>
              {allDone ? (
                <div style={{ textAlign: "center", padding: "44px 0 20px" }}>
                  <div style={{ width: 88, height: 88, borderRadius: "50%", background: "rgba(2,115,62,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <Icon name="check" size={44} color={_sw.green} strokeWidth={2.4} />
                  </div>
                  <div style={{ fontFamily: _sw.serif, fontSize: 30, color: _sw.green, fontWeight: 500 }}>Route Complete</div>
                  <div style={{ fontFamily: _sw.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 4 }}>
                    All {stops.length} stops done. Head back to the shop.
                  </div>
                </div>
              ) : (
                <>
                  {/* NEXT STOP hero */}
                  <Label color={_sw.goldDark} style={{ marginBottom: 8, marginLeft: 2 }}>Next Stop</Label>
                  <button onClick={() => openStop(next.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer",
                    background: "#fff", border: `1.5px solid ${_sw.green}`, borderRadius: 20, padding: 18,
                    boxShadow: "0 8px 24px rgba(2,115,62,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 13 }}>
                      <NumBadge n={next.order} active />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: _sw.serif, fontSize: 25, fontWeight: 500, color: _sw.charcoal,
                          lineHeight: 1.06 }}>{next.name}</div>
                        <div style={{ fontFamily: _sw.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 3 }}>
                          {next.address}, {next.town}
                        </div>
                      </div>
                      {next.gate && <span style={{ flexShrink: 0 }}><Icon name="key" size={18} color={_sw.goldDark} /></span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14, marginLeft: 53, flexWrap: "wrap" }}>
                      {next.dropoff && <TaskBadge type="drop" bags={next.dropBags} />}
                      {next.pickup && <TaskBadge type="pick" bags={next.pickBags} />}
                    </div>
                    <div style={{ marginTop: 15, marginLeft: 53, display: "inline-flex", alignItems: "center", gap: 7,
                      color: _sw.green, fontFamily: _sw.body, fontSize: 13, fontWeight: 600, letterSpacing: "0.12em",
                      textTransform: "uppercase" }}>
                      Open Stop <Icon name="chevron" size={15} color={_sw.green} />
                    </div>
                  </button>

                  {/* up next */}
                  {remaining.length > 1 && (
                    <div style={{ marginTop: 22 }}>
                      <Label style={{ marginBottom: 10, marginLeft: 2 }}>Up Next · {remaining.length - 1}</Label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {remaining.slice(1).map((s) => <StopRow key={s.id} s={s} onClick={() => openStop(s.id)} />)}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* completed */}
              {finished.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <button onClick={() => setShowDone((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 7,
                    background: "none", border: "none", cursor: "pointer", padding: "0 2px", marginBottom: 10 }}>
                    <Label>Completed · {finished.length}</Label>
                    <Icon name={showDone ? "chevronUp" : "chevron"} size={14} color="rgba(26,26,26,0.4)"
                      style={{ transform: showDone ? "none" : "rotate(90deg)" }} />
                  </button>
                  {showDone && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {finished.map((s) => <StopRow key={s.id} s={s} done onClick={() => openStop(s.id)} />)}
                    </div>
                  )}
                </div>
              )}

              {/* offline toggle (demo control) */}
              <button onClick={() => setOffline((v) => !v)} style={{ margin: "24px auto 0", display: "block",
                background: "none", border: `1px solid ${_sw.creamDark}`, borderRadius: 999, padding: "8px 16px",
                cursor: "pointer", fontFamily: _sw.body, fontSize: 11.5, letterSpacing: "0.1em",
                textTransform: "uppercase", color: "rgba(26,26,26,0.4)" }}>
                {offline ? "Simulate: back online" : "Simulate: lose signal"}
              </button>
            </>
          )}
        </div>
      </div>
      <Toast toast={toast} />
    </Frame>
  );
}

// ── sub-pieces ─────────────────────────────────────────────────
function NumBadge({ n, active, done }) {
  return (
    <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, display: "flex",
      alignItems: "center", justifyContent: "center", fontFamily: _sw.body, fontSize: 16, fontWeight: 600,
      background: done ? _sw.green : active ? _sw.green : _sw.creamDark,
      color: done || active ? _sw.cream : "rgba(26,26,26,0.5)" }}>
      {done ? <Icon name="check" size={20} color={_sw.cream} strokeWidth={2.6} /> : n}
    </div>
  );
}

function StopRow({ s, onClick, done }) {
  const isProblem = s.status === "problem";
  return (
    <button onClick={onClick} style={{ width: "100%", textAlign: "left", cursor: "pointer", display: "flex",
      alignItems: "center", gap: 12, background: done ? "rgba(240,235,225,0.5)" : "#fff",
      border: `1px solid ${_sw.creamDark}`, borderRadius: 14, padding: "12px 14px", opacity: done && !isProblem ? 0.75 : 1 }}>
      <NumBadge n={s.order} done={s.status === "done"} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: _sw.body, fontSize: 15.5, fontWeight: 500, color: _sw.charcoal,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
        <div style={{ fontFamily: _sw.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)", marginTop: 1 }}>
          {s.address} · {s.town}
        </div>
      </div>
      {isProblem ? (
        <Icon name="alert" size={18} color={_sw.goldDark} />
      ) : !done ? (
        <div style={{ display: "flex", gap: 4 }}>
          {s.dropoff && <Icon name="arrowDown" size={16} color="rgba(2,115,62,0.6)" />}
          {s.pickup && <Icon name="arrowUp" size={16} color="rgba(213,154,41,0.8)" />}
        </div>
      ) : null}
    </button>
  );
}

function CheckRow({ label, icon, checked, onClick }) {
  return (
    <button onClick={onClick} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13, cursor: "pointer",
      background: checked ? "rgba(2,115,62,0.06)" : "#fff", border: `1.5px solid ${checked ? _sw.green : _sw.creamDark}`,
      borderRadius: 14, padding: "14px 16px", transition: "all .15s" }}>
      <div style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center",
        justifyContent: "center", background: checked ? _sw.green : "transparent",
        border: checked ? "none" : `2px solid rgba(26,26,26,0.2)` }}>
        {checked && <Icon name="check" size={16} color={_sw.cream} strokeWidth={2.8} />}
      </div>
      <Icon name={icon} size={18} color={checked ? _sw.green : "rgba(26,26,26,0.4)"} />
      <div style={{ fontFamily: _sw.body, fontSize: 15.5, color: _sw.charcoal,
        textDecoration: checked ? "none" : "none" }}>{label}</div>
    </button>
  );
}

function MiniMap({ stops, nextId, onPick }) {
  return (
    <div style={{ position: "relative", width: "100%", height: 520, borderRadius: 20, overflow: "hidden",
      border: `1px solid ${_sw.creamDark}` }}>
      <StreetMap>
        {/* route line through pending stops */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <polyline points={stops.map((s) => `${s.x},${s.y}`).join(" ")} fill="none"
            stroke={_sw.green} strokeOpacity="0.45" strokeWidth="0.9" strokeDasharray="2 1.6" strokeLinecap="round" />
        </svg>
        {stops.map((s) => {
          const done = s.status === "done";
          const isNext = s.id === nextId;
          return (
            <button key={s.id} onClick={() => onPick(s.id)} style={{ position: "absolute",
              left: `${s.x}%`, top: `${s.y}%`, transform: "translate(-50%,-100%)", cursor: "pointer",
              background: "none", border: "none", padding: 0, zIndex: isNext ? 5 : 2 }}>
              <Pin n={s.order} done={done} active={isNext} />
            </button>
          );
        })}
      </StreetMap>
    </div>
  );
}

function ProblemSheet({ name, onClose, onResolve }) {
  const reasons = ["Gate code didn’t work", "Nobody home", "Couldn’t access property", "Wrong address", "Other issue"];
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 80, display: "flex", flexDirection: "column",
      justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.4)" }} />
      <div style={{ position: "relative", background: _sw.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26,
        padding: "10px 16px 34px" }}>
        <div style={{ width: 40, height: 5, borderRadius: 999, background: _sw.creamDark, margin: "0 auto 14px" }} />
        <div style={{ fontFamily: _sw.serif, fontSize: 24, fontWeight: 500, color: _sw.charcoal }}>What happened?</div>
        <div style={{ fontFamily: _sw.body, fontSize: 13.5, color: "rgba(26,26,26,0.5)", marginTop: 3, marginBottom: 16 }}>
          Dispatch will be notified and {name}’s stop flagged.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {reasons.map((r) => (
            <button key={r} onClick={() => onResolve(r)} style={{ width: "100%", textAlign: "left", cursor: "pointer",
              background: "#fff", border: `1px solid ${_sw.creamDark}`, borderRadius: 14, padding: "15px 16px",
              fontFamily: _sw.body, fontSize: 15.5, color: _sw.charcoal, display: "flex", alignItems: "center",
              justifyContent: "space-between" }}>
              {r} <Icon name="chevron" size={16} color="rgba(26,26,26,0.3)" />
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: "100%", marginTop: 12, background: "none", border: "none",
          cursor: "pointer", fontFamily: _sw.body, fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase",
          color: "rgba(26,26,26,0.4)", padding: 10 }}>Cancel</button>
      </div>
    </div>
  );
}

function Toast({ toast }) {
  return (
    <div style={{ position: "absolute", top: _sw.safeTop + 50, left: 16, right: 16, zIndex: 90,
      display: "flex", justifyContent: "center", pointerEvents: "none",
      transition: "opacity .25s, transform .25s",
      opacity: toast ? 1 : 0, transform: toast ? "translateY(0)" : "translateY(-8px)" }}>
      {toast && (
        <div style={{ background: _sw.charcoal, color: _sw.cream, borderRadius: 14, padding: "11px 18px",
          fontFamily: _sw.body, fontSize: 13.5, fontWeight: 500, boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          maxWidth: "100%", textAlign: "center" }}>{toast}</div>
      )}
    </div>
  );
}

// frame wrapper
function Frame({ children, sbDark = true }) {
  return <IOSDevice statusBarDark={sbDark}>{children}</IOSDevice>;
}

window.DriverClean = DriverClean;
// share sub-pieces for the map-first flow
Object.assign(window, { Label, BigButton, TaskBadge, PhotoThumb, GreenHeader, SyncChip,
  NumBadge, CheckRow, ProblemSheet, Toast });
