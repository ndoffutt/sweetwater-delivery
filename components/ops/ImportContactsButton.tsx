"use client";

import { useRef, useState } from "react";
import { btnSecondary } from "@/components/ops/Bits";

// Upload a SPOT customer export (CSV) into the messaging address book.
export default function ImportContactsButton() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setNote("Importing…");
    try {
      const fd = new FormData();
      fd.append("contacts", file);
      const r = await fetch("/api/contacts/import", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Import failed");
      setNote(`Imported ${d.imported.toLocaleString()} contacts${d.skipped ? ` · ${d.skipped} rows skipped (no usable phone)` : ""}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <span className="inline-flex items-center gap-3">
      {note && <span className="text-[12.5px] text-[rgba(26,26,26,.62)] max-w-[320px]">{note}</span>}
      <button className={btnSecondary} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Importing…" : "Import SPOT contacts"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
      />
    </span>
  );
}
