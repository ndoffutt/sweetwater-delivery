// mgr-customers.jsx — Customer Directory: searchable list + detail, editable notes.
// Exports MgrCustomers.
const { useState: useStateC } = React;
const _cu = window.SW;

function MgrCustomers({ isMobile }) {
  const [q, setQ] = useStateC("");
  const [filter, setFilter] = useStateC("All");
  const [selId, setSelId] = useStateC(isMobile ? null : CUSTOMERS[0].id);
  const [notes, setNotes] = useStateC(() => Object.fromEntries(CUSTOMERS.map((c) => [c.id, c.notes])));
  const [editing, setEditing] = useStateC(false);
  const [draft, setDraft] = useStateC("");

  const filters = ["All", "VIP", "Seasonal", "Commercial"];
  const list = CUSTOMERS.filter((c) => {
    const mq = !q || (c.name + c.town + c.address).toLowerCase().includes(q.toLowerCase());
    const mf = filter === "All" || (c.tags || []).includes(filter);
    return mq && mf;
  });
  const sel = CUSTOMERS.find((c) => c.id === selId);

  function startEdit() { setDraft(notes[sel.id]); setEditing(true); }
  function saveEdit() { setNotes((n) => ({ ...n, [sel.id]: draft })); setEditing(false); }

  const pad = isMobile ? 16 : 0;
  const showList = !isMobile || !selId;
  const showDetail = !isMobile || selId;

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      {/* LIST */}
      {showList && (
        <div style={{ width: isMobile ? "100%" : 360, flexShrink: 0, borderRight: isMobile ? "none" : `1px solid ${_cu.creamDark}`,
          display: "flex", flexDirection: "column", background: "#fff", minHeight: 0 }}>
          <div style={{ padding: isMobile ? "16px 16px 12px" : "22px 20px 14px" }}>
            {!isMobile && <div style={{ fontFamily: _cu.serif, fontSize: 30, fontWeight: 500, marginBottom: 14 }}>Customers</div>}
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)" }}><MIcon name="search" size={18} color="rgba(26,26,26,0.4)" /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, town…"
                style={{ width: "100%", height: 44, paddingLeft: 40, paddingRight: 14, borderRadius: 12, border: `1px solid ${_cu.creamDark}`,
                  background: _cu.cream, fontFamily: _cu.body, fontSize: 14.5, color: _cu.charcoal, outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
              {filters.map((f) => (
                <button key={f} onClick={() => setFilter(f)} style={{ border: "none", cursor: "pointer", borderRadius: 999,
                  padding: "6px 13px", fontFamily: _cu.body, fontSize: 12.5, fontWeight: 500,
                  background: filter === f ? _cu.green : _cu.cream, color: filter === f ? _cu.cream : "rgba(26,26,26,0.6)" }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 12px 16px" }}>
            <SectionTitle style={{ padding: "6px 8px 8px" }}>{list.length} customers</SectionTitle>
            {list.map((c) => {
              const on = c.id === selId;
              return (
                <button key={c.id} onClick={() => setSelId(c.id)} style={{ width: "100%", textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 12, padding: "11px 10px", borderRadius: 12, marginBottom: 2,
                  background: on ? "rgba(2,115,62,0.07)" : "transparent", border: `1px solid ${on ? "rgba(2,115,62,0.25)" : "transparent"}` }}>
                  <Avatar name={c.name} size={38} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontFamily: _cu.body, fontSize: 14.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                      {(c.tags || []).includes("VIP") && <MIcon name="star" size={13} color={_cu.goldDark} />}
                    </div>
                    <div style={{ fontFamily: _cu.body, fontSize: 12.5, color: "rgba(26,26,26,0.45)" }}>{c.town} · Last {c.lastDelivered}</div>
                  </div>
                  <MIcon name="chevron" size={15} color="rgba(26,26,26,0.25)" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* DETAIL */}
      {showDetail && sel && (
        <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: isMobile ? 16 : 30 }}>
          {isMobile && (
            <button onClick={() => setSelId(null)} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none",
              border: "none", cursor: "pointer", fontFamily: _cu.body, fontSize: 14, color: _cu.green, marginBottom: 14, padding: 0 }}>
              <MIcon name="chevron" size={16} color={_cu.green} style={{ transform: "rotate(180deg)" }} /> All customers
            </button>
          )}
          <div style={{ maxWidth: 720 }}>
            {/* header */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <Avatar name={sel.name} size={60} bg={_cu.green} fg={_cu.cream} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: _cu.serif, fontSize: isMobile ? 28 : 34, fontWeight: 500, lineHeight: 1.05 }}>{sel.name}</div>
                <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
                  {(sel.tags || []).map((t) => <Tag key={t}>{t}</Tag>)}
                  {(!sel.tags || !sel.tags.length) && <span style={{ fontSize: 13, color: "rgba(26,26,26,0.4)" }}>No tags</span>}
                </div>
              </div>
            </div>

            {/* contact grid */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginTop: 22 }}>
              <InfoTile icon="pin" label="Address" value={`${sel.address}, ${sel.town}`} />
              <InfoTile icon="phone" label="Phone" value={sel.phone} action="Call" />
              <InfoTile icon="key" label="Gate / entry code" value={sel.gate || "—"} mono={!!sel.gate} />
              <InfoTile icon="clock" label="Last delivered" value={sel.lastDelivered} />
            </div>

            {/* standing notes — editable */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                <SectionTitle>Standing delivery notes</SectionTitle>
                {!editing ? (
                  <button onClick={startEdit} style={editLink()}><MIcon name="edit" size={15} color={_cu.green} /> Edit</button>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditing(false)} style={{ ...editLink(), color: "rgba(26,26,26,0.45)" }}>Cancel</button>
                    <button onClick={saveEdit} style={{ ...editLink(), fontWeight: 600 }}><MIcon name="check" size={15} color={_cu.green} /> Save</button>
                  </div>
                )}
              </div>
              {!editing ? (
                <MCard style={{ background: "rgba(2,115,62,0.04)", borderColor: "rgba(2,115,62,0.18)" }}>
                  <div style={{ fontFamily: _cu.body, fontSize: 15, lineHeight: 1.55, color: _cu.charcoal }}>{notes[sel.id]}</div>
                </MCard>
              ) : (
                <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} autoFocus
                  style={{ width: "100%", borderRadius: 14, border: `1.5px solid ${_cu.green}`, padding: "14px 16px",
                    fontFamily: _cu.body, fontSize: 15, lineHeight: 1.55, color: _cu.charcoal, outline: "none", resize: "vertical", background: "#fff" }} />
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontFamily: _cu.body, fontSize: 12, color: "rgba(26,26,26,0.4)" }}>
                <MIcon name="customers" size={13} color="rgba(26,26,26,0.35)" /> Drivers can also update these from the road.
              </div>
            </div>

            {/* recent activity */}
            <div style={{ marginTop: 22 }}>
              <SectionTitle style={{ marginBottom: 10 }}>Recent activity</SectionTitle>
              <MCard pad={0}>
                {[
                  { d: "Jun 6", t: "9:12 AM", a: "Delivered + pickup", who: "Marcus", photo: true },
                  { d: "Jun 4", t: "9:42 AM", a: "Delivered", who: "Marcus", photo: true },
                  { d: "May 30", t: "10:21 AM", a: "Delivered + pickup", who: "Marcus", photo: true },
                ].map((r, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
                    borderTop: i ? `1px solid ${_cu.creamDark}` : "none" }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: _cu.cream, flexShrink: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: _cu.green }}>{r.d.split(" ")[1]}</span>
                      <span style={{ fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(26,26,26,0.4)" }}>{r.d.split(" ")[0]}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: _cu.body, fontSize: 14, fontWeight: 500 }}>{r.a}</div>
                      <div style={{ fontFamily: _cu.body, fontSize: 12, color: "rgba(26,26,26,0.45)" }}>{r.t} · {r.who}</div>
                    </div>
                    {r.photo && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: _cu.green, fontWeight: 500 }}>
                        <MIcon name="camera" size={15} color={_cu.green} /> Photo
                      </div>
                    )}
                  </div>
                ))}
              </MCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoTile({ icon, label, value, action, mono }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${_cu.creamDark}`, borderRadius: 14, padding: "13px 15px",
      display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: _cu.cream, display: "flex", alignItems: "center",
        justifyContent: "center", flexShrink: 0 }}><MIcon name={icon} size={18} color={_cu.green} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <SectionTitle style={{ fontSize: 10, marginBottom: 3 }}>{label}</SectionTitle>
        <div style={{ fontFamily: mono ? "ui-monospace, monospace" : _cu.body, fontSize: mono ? 17 : 14.5,
          fontWeight: mono ? 600 : 500, letterSpacing: mono ? "0.12em" : "0", color: _cu.charcoal,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      </div>
      {action && <span style={{ fontFamily: _cu.body, fontSize: 11.5, letterSpacing: "0.12em", textTransform: "uppercase",
        color: _cu.green, fontWeight: 600, flexShrink: 0 }}>{action}</span>}
    </div>
  );
}

function editLink() {
  return { display: "inline-flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer",
    fontFamily: _cu.body, fontSize: 13, color: _cu.green, fontWeight: 500, padding: 0 };
}

window.MgrCustomers = MgrCustomers;
