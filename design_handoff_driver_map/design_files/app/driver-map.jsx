// driver-map.jsx — Direction B: "Map-First" (the Uber model) — refined.
// Full-screen map home + bottom sheet + slide-to-arrive + offline + overview.
// Exports <DriverMap cfg={...}/>. cfg keys: accent, arrive, photoRequired, mapLabels, startExpanded.
const { useState: useStateM, useRef: useRefM, useEffect: useEffectM } = React;
const _m = window.SW;

const ACCENTS = { green: "#02733e", teal: "#0c6b5f", forest: "#1f4d2e" };

// slide-to-confirm control
function SlideToConfirm({ label, onConfirm, color }) {
  const trackRef = useRefM(null);
  const [x, setX] = useStateM(0);
  const [dragging, setDragging] = useStateM(false);
  const [done, setDone] = useStateM(false);
  const startX = useRefM(0);
  const knob = 56;
  function maxX() { const w = trackRef.current ? trackRef.current.offsetWidth : 300; return w - knob - 6; }
  function down(e) { setDragging(true); startX.current = (e.touches ? e.touches[0].clientX : e.clientX) - x; }
  function move(e) {
    if (!dragging) return;
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    setX(Math.max(0, Math.min(maxX(), cx - startX.current)));
  }
  function up() {
    if (!dragging) return;
    setDragging(false);
    if (x > maxX() * 0.82) { setX(maxX()); setDone(true); setTimeout(() => onConfirm(), 240); }
    else setX(0);
  }
  useEffectM(() => {
    if (!dragging) return;
    const mv = (e) => move(e); const u = () => up();
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", u);
    window.addEventListener("touchmove", mv); window.addEventListener("touchend", u);
    return () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", u);
      window.removeEventListener("touchmove", mv); window.removeEventListener("touchend", u);
    };
  });
  const c = color || _m.green;
  const pct = trackRef.current ? x / maxX() : 0;
  return (
    <div ref={trackRef} style={{ position: "relative", height: 62, borderRadius: 16, background: "rgba(2,115,62,0.1)",
      border: `1.5px solid rgba(2,115,62,0.25)`, overflow: "hidden", userSelect: "none", touchAction: "none" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: _m.body, fontSize: 14.5, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
        color: c, opacity: 1 - pct * 1.2 }}>{done ? "" : label}</div>
      <div onMouseDown={down} onTouchStart={down} style={{ position: "absolute", top: 3, left: 3,
        width: knob, height: 52, borderRadius: 13, background: c, transform: `translateX(${x}px)`,
        transition: dragging ? "none" : "transform .2s", display: "flex", alignItems: "center",
        justifyContent: "center", cursor: "grab", boxShadow: "0 3px 10px rgba(2,115,62,0.35)" }}>
        <Icon name={done ? "check" : "chevron"} size={24} color={_m.cream} strokeWidth={2.6} />
      </div>
    </div>
  );
}

function DriverMap({ cfg = {} }) {
  const acc = (cfg.accent && cfg.accent[0] === "#") ? cfg.accent : (ACCENTS[cfg.accent] || ACCENTS.green);
  const photoRequired = cfg.photoRequired !== false;
  const arriveMode = cfg.arrive || "slide";
  const mapLabels = cfg.mapLabels !== false;

  const [started, setStarted] = useStateM(false);
  const [stops, setStops] = useStateM(() => makeStops().map((s) => ({
    ...s, status: "pending", dropDone: false, pickDone: false, photo: false,
  })));
  const [targetId, setTargetId] = useStateM("s1");
  const [sheet, setSheet] = useStateM(cfg.startExpanded ? "full" : "peek");
  const [overview, setOverview] = useStateM(false);
  const [problemFor, setProblemFor] = useStateM(null);
  const [toast, setToast] = useStateM(null);
  const [offline, setOffline] = useStateM(false);
  const [pending, setPending] = useStateM(0); // queued offline updates
  const tt = useRefM(null);

  function flash(msg) { setToast(msg); clearTimeout(tt.current); tt.current = setTimeout(() => setToast(null), 2600); }
  function patch(id, f) { setStops((arr) => arr.map((s) => (s.id === id ? { ...s, ...f } : s))); }
  const firstName = (n) => n.replace(/^(Mr\.|Mrs\.|Ms\.|Dr\.|The)\s+/i, "").split(" ")[0].replace(/[^A-Za-z].*$/, "");

  const remaining = stops.filter((s) => s.status === "pending" || s.status === "arrived");
  const finished = stops.filter((s) => s.status === "done" || s.status === "problem");
  const target = stops.find((s) => s.id === targetId) || remaining[0];
  const allDone = remaining.length === 0;

  function selectPin(id) { setTargetId(id); setSheet("peek"); }
  function notify(msg) { if (offline) { setPending((p) => p + 1); flash("Saved offline — will text when back online"); } else flash(msg); }
  function arrive(s) { patch(s.id, { status: "arrived" }); setSheet("full"); notify(`✓ Texted ${firstName(s.name)} — “On our way”`); }
  function complete(s) {
    patch(s.id, { status: "done" });
    notify(`✓ Delivered — ${firstName(s.name)} notified`);
    const nextStop = stops.find((x) => x.status === "pending" && x.id !== s.id);
    setTargetId(nextStop ? nextStop.id : s.id); setSheet("peek");
  }
  function resolveProblem(reason) {
    patch(problemFor.id, { status: "problem", problem: reason });
    flash("Dispatch notified");
    const nextStop = stops.find((x) => x.status === "pending" && x.id !== problemFor.id);
    if (nextStop) setTargetId(nextStop.id);
    setProblemFor(null); setSheet("peek");
  }
  function toggleOffline() {
    if (offline) { setOffline(false); flash(pending ? `Back online — synced ${pending} update${pending === 1 ? "" : "s"}` : "Back online — synced"); setPending(0); }
    else { setOffline(true); flash("Offline — updates will queue"); }
  }

  // ── START SCREEN ──
  if (!started) {
    return (
      <IOSDevice statusBarDark={true}>
        <div style={{ height: "100%", position: "relative", background: _m.greenDark }}>
          <StreetMap labelRoads={false} style={{ opacity: 0.5 }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(1,90,48,0.55), rgba(1,60,32,0.92))" }} />
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: "0 32px", color: _m.cream }}>
            <div style={{ width: 84, height: 84, borderRadius: "50%", border: `1.5px solid rgba(232,184,75,0.7)`,
              display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 22 }}>
              <span style={{ fontFamily: _m.serif, fontSize: 46, color: _m.goldLight, fontWeight: 500, lineHeight: 1 }}>S</span>
            </div>
            <div style={{ fontFamily: _m.serif, fontSize: 40, fontWeight: 500, lineHeight: 1 }}>Sweetwater’s</div>
            <div style={{ fontFamily: _m.body, fontSize: 12, letterSpacing: "0.22em", textTransform: "uppercase",
              color: _m.goldLight, marginTop: 8 }}>Delivery · Driver</div>
            <div style={{ width: "100%", marginTop: 48 }}>
              <button onClick={() => setStarted(true)} style={{ width: "100%", minHeight: 62, borderRadius: 16,
                background: _m.gold, color: _m.charcoal, border: "none", cursor: "pointer", fontFamily: _m.body,
                fontSize: 15, fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <Icon name="nav" size={20} color={_m.charcoal} /> Start Driving
              </button>
            </div>
            <div style={{ position: "absolute", bottom: 44, display: "flex", alignItems: "center", gap: 7,
              fontFamily: _m.body, fontSize: 12, color: "rgba(250,247,242,0.7)" }}>
              <Icon name="route" size={16} color={_m.goldLight} /> 8 stops · 14.2 mi today
            </div>
          </div>
        </div>
      </IOSDevice>
    );
  }

  const needDrop = target && target.dropoff && !target.dropDone;
  const needPick = target && target.pickup && !target.pickDone;
  const canComplete = target && (!photoRequired || target.photo) && !needDrop && !needPick;

  return (
    <IOSDevice statusBarDark={false}>
      <div style={{ height: "100%", position: "relative", overflow: "hidden", background: "#EAE6DC" }}>
        {/* MAP */}
        <StreetMap labelRoads={mapLabels}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <polyline points={stops.map((s) => `${s.x},${s.y}`).join(" ")} fill="none"
              stroke={acc} strokeOpacity="0.4" strokeWidth="0.9" strokeDasharray="2 1.6" strokeLinecap="round" />
          </svg>
          {stops.map((s) => (
            <button key={s.id} onClick={() => selectPin(s.id)} style={{ position: "absolute", left: `${s.x}%`, top: `${s.y}%`,
              transform: "translate(-50%,-100%)", cursor: "pointer", background: "none", border: "none", padding: 0,
              zIndex: s.id === targetId ? 6 : 2 }}>
              <Pin n={s.order} done={s.status === "done"} active={s.id === targetId} />
            </button>
          ))}
          <div style={{ position: "absolute", left: "70%", top: "20%", transform: "translate(-50%,-50%)", zIndex: 7 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#2a7de1", border: "3px solid #fff",
              boxShadow: "0 0 0 6px rgba(42,125,225,0.2)" }} />
          </div>
        </StreetMap>

        {/* TOP: progress pill (tap → overview) + sync chip */}
        <div style={{ position: "absolute", top: _m.safeTop + 6, left: 16, right: 16, zIndex: 10,
          display: "flex", alignItems: "stretch", gap: 8 }}>
          <button onClick={() => setOverview(true)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            borderRadius: 16, padding: "11px 14px", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", border: "none", cursor: "pointer", textAlign: "left" }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: acc, display: "flex",
              alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="route" size={20} color={_m.cream} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: _m.body, fontSize: 14, fontWeight: 600, color: _m.charcoal }}>
                {allDone ? "Route complete" : `${remaining.length} stop${remaining.length === 1 ? "" : "s"} left`}
              </div>
              <div style={{ height: 5, background: "rgba(26,26,26,0.1)", borderRadius: 999, marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(finished.length / stops.length) * 100}%`, background: acc, borderRadius: 999 }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0 }}>
              <span style={{ fontFamily: _m.body, fontSize: 13, fontWeight: 600, color: acc }}>{finished.length}/{stops.length}</span>
              <Icon name="chevron" size={14} color="rgba(26,26,26,0.35)" style={{ transform: "rotate(90deg)" }} />
            </div>
          </button>
          <button onClick={toggleOffline} title="Toggle signal" style={{ flexShrink: 0, width: 50, borderRadius: 16,
            background: offline ? "rgba(213,154,41,0.92)" : "rgba(255,255,255,0.86)", backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)", boxShadow: "0 6px 20px rgba(0,0,0,0.12)", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 }}>
            <Icon name={offline ? "cloud" : "cloudCheck"} size={20} color={offline ? "#fff" : acc} />
            {offline && pending > 0 && <span style={{ fontFamily: _m.body, fontSize: 10, fontWeight: 700, color: "#fff" }}>{pending}</span>}
          </button>
        </div>

        {/* recenter button (sits above the sheet) */}
        {!allDone && (
          <button onClick={() => flash("Re-centered on you")} style={{ position: "absolute", right: 16,
            bottom: sheet === "full" ? "auto" : 300, top: sheet === "full" ? _m.safeTop + 66 : "auto", zIndex: 9,
            width: 46, height: 46, borderRadius: 14, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)", boxShadow: "0 4px 14px rgba(0,0,0,0.15)", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="nav" size={20} color="#2a7de1" />
          </button>
        )}

        {/* BOTTOM SHEET */}
        {allDone ? (
          <BottomShell>
            <div style={{ textAlign: "center", padding: "6px 0 8px" }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(2,115,62,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                <Icon name="check" size={38} color={acc} strokeWidth={2.4} />
              </div>
              <div style={{ fontFamily: _m.serif, fontSize: 28, color: acc, fontWeight: 500 }}>Route Complete</div>
              <div style={{ fontFamily: _m.body, fontSize: 14, color: "rgba(26,26,26,0.5)", marginTop: 3 }}>
                All {stops.length} stops done — head back to the shop.
              </div>
            </div>
          </BottomShell>
        ) : target && (
          <BottomShell onGrip={() => setSheet(sheet === "peek" ? "full" : "peek")} expanded={sheet === "full"}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <NumBadge n={target.order} active />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: _m.serif, fontSize: 24, fontWeight: 500, color: _m.charcoal, lineHeight: 1.06 }}>{target.name}</div>
                <div style={{ fontFamily: _m.body, fontSize: 13.5, color: "rgba(26,26,26,0.5)", marginTop: 2 }}>{target.address}, {target.town}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: _m.body, fontSize: 18, fontWeight: 600, color: acc }}>2.4 mi</div>
                <div style={{ fontFamily: _m.body, fontSize: 11.5, color: "rgba(26,26,26,0.45)" }}>~7 min</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
              {target.dropoff && <TaskBadge type="drop" bags={target.dropBags} />}
              {target.pickup && <TaskBadge type="pick" bags={target.pickBags} />}
              {target.gate && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", background: "rgba(213,154,41,0.14)",
                  color: _m.goldDark, borderRadius: 8, padding: "4px 9px", fontFamily: _m.body, fontSize: 12.5, fontWeight: 500 }}>
                  <Icon name="key" size={14} /> {target.gate}
                </span>
              )}
            </div>

            {sheet === "full" && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${_m.creamDark}`, paddingTop: 14 }}>
                {target.notes && (
                  <div style={{ background: "rgba(2,115,62,0.05)", border: `1px solid rgba(2,115,62,0.18)`,
                    borderRadius: 13, padding: "12px 14px", marginBottom: 12 }}>
                    <Label color={acc}>Delivery Notes</Label>
                    <div style={{ fontFamily: _m.body, fontSize: 14.5, color: _m.charcoal, marginTop: 4, lineHeight: 1.45 }}>{target.notes}</div>
                  </div>
                )}
                <a href="#" onClick={(e) => { e.preventDefault(); flash(`Calling ${firstName(target.name)}…`); }}
                  style={{ display: "flex", alignItems: "center", gap: 11, background: "#fff", border: `1px solid ${_m.creamDark}`,
                    borderRadius: 13, padding: "12px 14px", textDecoration: "none", marginBottom: 12 }}>
                  <Icon name="phone" size={19} color={acc} />
                  <span style={{ fontFamily: _m.body, fontSize: 14.5, color: _m.charcoal }}>{target.phone}</span>
                  <span style={{ marginLeft: "auto", fontFamily: _m.body, fontSize: 11.5, letterSpacing: "0.14em",
                    textTransform: "uppercase", color: "rgba(26,26,26,0.35)" }}>Call</span>
                </a>

                {target.status === "arrived" && (
                  <>
                    <Label style={{ marginBottom: 9, marginLeft: 2 }}>Confirm what you did</Label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 12 }}>
                      {target.dropoff && <CheckRow label="Dropped off" icon="arrowDown"
                        checked={target.dropDone} onClick={() => patch(target.id, { dropDone: !target.dropDone })} />}
                      {target.pickup && <CheckRow label="Picked up" icon="arrowUp"
                        checked={target.pickDone} onClick={() => patch(target.id, { pickDone: !target.pickDone })} />}
                    </div>
                    <Label style={{ marginBottom: 9, marginLeft: 2 }}>
                      Photo proof <span style={{ color: target.photo ? acc : photoRequired ? _m.goldDark : "rgba(26,26,26,0.4)" }}>· {photoRequired ? "required" : "optional"}</span>
                    </Label>
                    {target.photo ? <PhotoThumb /> : (
                      <button onClick={() => patch(target.id, { photo: true })} style={{ width: "100%", aspectRatio: "5/2",
                        borderRadius: 13, border: `1.5px dashed rgba(2,115,62,0.4)`, background: "rgba(2,115,62,0.04)",
                        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, cursor: "pointer" }}>
                        <Icon name="camera" size={28} color={acc} />
                        <span style={{ fontFamily: _m.body, fontSize: 13.5, letterSpacing: "0.14em", textTransform: "uppercase", color: acc }}>Take Photo</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ACTION zone */}
            <div style={{ marginTop: 14 }}>
              {target.status === "pending" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => window.open(mapsHref(target), "_blank")} style={{ flex: 1, minHeight: 54, borderRadius: 15,
                      background: _m.gold, color: _m.charcoal, border: "none", cursor: "pointer", fontFamily: _m.body,
                      fontSize: 14, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <Icon name="nav" size={18} color={_m.charcoal} /> Navigate
                    </button>
                    <button onClick={() => setProblemFor(target)} style={{ width: 54, minHeight: 54, borderRadius: 15,
                      background: "#fff", border: `1px solid ${_m.creamDark}`, cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center" }}>
                      <Icon name="alert" size={20} color={_m.goldDark} />
                    </button>
                  </div>
                  {arriveMode === "slide"
                    ? <SlideToConfirm label="Slide to arrive" color={acc} onConfirm={() => arrive(target)} />
                    : <BigButton variant="green" onClick={() => arrive(target)}>I’m Here →</BigButton>}
                </div>
              )}
              {target.status === "arrived" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <BigButton variant="green" icon="check" disabled={!canComplete} onClick={() => complete(target)}>Complete Stop</BigButton>
                  {!canComplete && (
                    <div style={{ textAlign: "center", fontFamily: _m.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>
                      {photoRequired && !target.photo ? "Snap a photo to finish" : "Confirm the tasks above"}
                    </div>
                  )}
                </div>
              )}
            </div>
          </BottomShell>
        )}

        {overview && <OverviewSheet stops={stops} targetId={targetId} accent={acc}
          onPick={(id) => { selectPin(id); setOverview(false); }} onClose={() => setOverview(false)} />}
        {problemFor && <ProblemSheet name={firstName(problemFor.name)} onClose={() => setProblemFor(null)} onResolve={resolveProblem} />}
        <Toast toast={toast} />
      </div>
    </IOSDevice>
  );
}

function OverviewSheet({ stops, targetId, accent, onPick, onClose }) {
  const statusText = { pending: "", arrived: "On site", done: "Done", problem: "Flagged" };
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(26,26,26,0.4)" }} />
      <div style={{ position: "relative", background: _m.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26,
        padding: "10px 16px 30px", maxHeight: "82%", overflow: "auto" }}>
        <div style={{ width: 42, height: 5, borderRadius: 999, background: _m.creamDark, margin: "0 auto 12px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: _m.serif, fontSize: 24, fontWeight: 500, color: _m.charcoal }}>Today’s Route</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <Icon name="x" size={20} color="rgba(26,26,26,0.4)" />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {stops.map((s) => {
            const sel = s.id === targetId;
            return (
              <button key={s.id} onClick={() => onPick(s.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 12, background: sel ? "rgba(2,115,62,0.07)" : "#fff",
                border: `1px solid ${sel ? "rgba(2,115,62,0.3)" : _m.creamDark}`, borderRadius: 13, padding: "11px 13px" }}>
                <NumBadge n={s.order} done={s.status === "done"} active={sel} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: _m.body, fontSize: 15, fontWeight: 500, color: _m.charcoal,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", opacity: s.status === "done" ? 0.6 : 1 }}>{s.name}</div>
                  <div style={{ fontFamily: _m.body, fontSize: 12, color: "rgba(26,26,26,0.45)" }}>{s.address} · {s.town}</div>
                </div>
                {statusText[s.status] ? (
                  <span style={{ flexShrink: 0, fontFamily: _m.body, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: s.status === "done" ? accent : s.status === "problem" ? _m.goldDark : _m.gold }}>
                    {statusText[s.status]}
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    {s.dropoff && <Icon name="arrowDown" size={15} color="rgba(2,115,62,0.6)" />}
                    {s.pickup && <Icon name="arrowUp" size={15} color="rgba(213,154,41,0.85)" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function BottomShell({ children, onGrip, expanded }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 12,
      background: _m.cream, borderTopLeftRadius: 26, borderTopRightRadius: 26,
      boxShadow: "0 -10px 40px rgba(0,0,0,0.16)", padding: "8px 18px 34px",
      maxHeight: expanded ? "82%" : "auto", overflow: expanded ? "auto" : "visible", transition: "max-height .25s" }}>
      <button onClick={onGrip} disabled={!onGrip} style={{ display: "block", width: "100%", background: "none",
        border: "none", cursor: onGrip ? "pointer" : "default", padding: "4px 0 10px" }}>
        <div style={{ width: 42, height: 5, borderRadius: 999, background: _m.creamDark, margin: "0 auto" }} />
      </button>
      {children}
    </div>
  );
}

window.DriverMap = DriverMap;
