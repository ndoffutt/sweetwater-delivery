import type { ManifestStop } from "./extract";

// Parse a single CSV line, honoring double-quoted fields that contain commas.
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Title-case a name segment while preserving "/" joins, e.g.
// "BORSELLA/hoefler" -> "Borsella/Hoefler", "SOFFER" -> "Soffer".
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/([a-z])([a-z']*)/g, (_, a: string, b: string) => a.toUpperCase() + b);
}

// "Last, First" / "Last1/Last2, First1/First2" -> "First Last".
// Single names with no comma (e.g. "Zimmermann", "Brunello Cucinelli") pass through.
function toDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const comma = t.indexOf(",");
  if (comma === -1) return titleCase(t);
  const last = t.slice(0, comma).trim();
  let first = t.slice(comma + 1).trim();
  first = first.replace(/\s+\d+$/, ""); // strip SPOT dup-name suffixes like "Jill 1"
  const name = first ? `${first} ${last}` : last;
  return titleCase(name);
}

const normState = (s: string) => (/^new york$/i.test(s.trim()) ? "NY" : s.trim().toUpperCase() || "NY");

function lower(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Parse a SPOT delivery-manifest CSV export into stops. Two shapes are handled:
 *
 *  1. The real SPOT manifest export - one row PER INVOICE line-item, columns
 *     include CustomerName / Address1 / City / State / Zip / StopNumber /
 *     VisitType. Multiple rows share a StopNumber → collapsed into one stop.
 *  2. The simpler `delivery_route.csv` shape (one row per stop:
 *     stop_order,name,full_address,phone,latitude,longitude).
 *
 * SPOT carries no lat/lng, so those come from the matched customer; the simpler
 * shape does include coordinates.
 */
export function parseManifestCsv(text: string): ManifestStop[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => lower(h));
  const idx = (name: string) => header.indexOf(name);
  const rows = lines.slice(1).map(splitCsvLine);

  // ── Shape 1: real SPOT manifest (group line-items by stop) ──
  if (idx("customername") >= 0 && idx("address1") >= 0) {
    const c = {
      stop: idx("assignedstopnumber") >= 0 ? idx("assignedstopnumber") : idx("stopnumber"),
      name: idx("customername"),
      a1: idx("address1"),
      a2: idx("address2"),
      city: idx("city"),
      state: idx("state"),
      zip: idx("zip"),
      phone: idx("phone"),
      phone2: idx("phone2"),
      visit: idx("visittype"),
      days: idx("deliverydays"),
      timeSpec: idx("timespecifier"),
      timeRange: idx("timerange"),
      instr: idx("deliveryinstructions"),
      msg: idx("drivermessage"),
      custId: idx("customerid"),
      pieces: idx("piececount"),
    };
    const at = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

    const stops = new Map<string, ManifestStop & { _order: number }>();
    for (const row of rows) {
      const name = at(row, c.name);
      if (!name) continue;
      const stopNo = at(row, c.stop);
      const key = `${stopNo || "?"}|${at(row, c.custId) || name}`;

      const visit = at(row, c.visit).toLowerCase();
      const onDemand = /on dmnd/i.test(at(row, c.days));
      const isPickup = visit.includes("pickup");
      const isDelivery = visit.includes("delivery") || (!isPickup && !onDemand);
      const linePieces = isDelivery && !onDemand ? parseInt(at(row, c.pieces), 10) || 0 : 0;

      if (!stops.has(key)) {
        const street = [at(row, c.a1), at(row, c.a2)].filter(Boolean).join(" ");
        const address = [street, at(row, c.city), `${normState(at(row, c.state))} ${at(row, c.zip)}`.trim()]
          .filter(Boolean)
          .join(", ");

        const noteParts: string[] = [];
        if (onDemand) noteParts.push("On demand");
        const ts = at(row, c.timeSpec);
        if (ts && !/no time preference/i.test(ts)) noteParts.push(ts);
        const instr = at(row, c.instr);
        if (instr && instr !== "-------") noteParts.push(instr);
        const msg = at(row, c.msg);
        if (msg && msg !== "-------") noteParts.push(msg);

        const ord = parseInt(stopNo, 10);
        stops.set(key, {
          _order: Number.isFinite(ord) ? ord : stops.size + 1,
          stop_order: Number.isFinite(ord) ? ord : null,
          customer_name: toDisplayName(name),
          address,
          phone: at(row, c.phone) || at(row, c.phone2) || null,
          has_dropoff: isDelivery && !onDemand,
          has_pickup: isPickup || onDemand,
          notes: noteParts.join(" · ") || null,
          piece_count: linePieces,
        });
      } else {
        // Merge flags + pieces across line-items of the same stop.
        const s = stops.get(key)!;
        if (isDelivery && !onDemand) s.has_dropoff = true;
        if (isPickup || onDemand) s.has_pickup = true;
        s.piece_count = (s.piece_count ?? 0) + linePieces;
      }
    }

    return Array.from(stops.values())
      .sort((a, b) => a._order - b._order)
      .map(({ _order, ...s }) => { void _order; return s; });
  }

  // ── Shape 2: simple delivery_route.csv (one row per stop) ──
  if (idx("name") >= 0 && (idx("full_address") >= 0 || idx("address") >= 0)) {
    const iOrder = idx("stop_order");
    const iName = idx("name");
    const iAddr = idx("address");
    const iCity = idx("city");
    const iState = idx("state");
    const iZip = idx("zip");
    const iFull = idx("full_address");
    const iPhone = idx("phone");
    const iLat = idx("latitude");
    const iLng = idx("longitude");

    const stops: ManifestStop[] = [];
    for (const cells of rows) {
      const name = iName >= 0 ? (cells[iName] ?? "").trim() : "";
      if (!name) continue;
      const full =
        iFull >= 0 && cells[iFull]?.trim()
          ? cells[iFull].trim()
          : [
              iAddr >= 0 ? cells[iAddr]?.trim() : "",
              iCity >= 0 ? cells[iCity]?.trim() : "",
              [iState >= 0 ? cells[iState]?.trim() : "", iZip >= 0 ? cells[iZip]?.trim() : ""].filter(Boolean).join(" "),
            ]
              .filter(Boolean)
              .join(", ");
      const orderRaw = iOrder >= 0 ? parseInt(cells[iOrder] ?? "", 10) : NaN;
      const lat = iLat >= 0 ? parseFloat(cells[iLat] ?? "") : NaN;
      const lng = iLng >= 0 ? parseFloat(cells[iLng] ?? "") : NaN;
      stops.push({
        stop_order: Number.isFinite(orderRaw) ? orderRaw : null,
        customer_name: toDisplayName(name),
        address: full,
        phone: (iPhone >= 0 ? cells[iPhone]?.trim() : "") || null,
        has_dropoff: true,
        has_pickup: false,
        notes: null,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
      });
    }
    return stops;
  }

  return [];
}
