"use client";

// A list you add rows to, for fields that are genuinely a list of things.
//
// These were textareas labelled "one per line", which is a textarea asking the
// writer to remember a convention — so it got one long sentence instead. Rows
// with an add button make the shape obvious before anything is typed.
//
// Stored as newline-joined text so the column and the weekly-email renderer
// are unchanged; this is purely how it's edited.
import { useState } from "react";
import { inputCls } from "@/components/ops/Bits";

export default function LineListField({
  label,
  value,
  onChange,
  placeholder,
  addLabel = "+ Add",
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  /** Prompts, shown one per empty row as the writer works down. */
  placeholder?: string[];
  addLabel?: string;
}) {
  const lines = value ? value.split("\n") : [];
  // Always show one empty row to type into, so the field is never a dead end.
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const t = draft.trim();
    if (!t) return;
    onChange([...lines, t].join("\n"));
    setDraft("");
  }
  function editLine(i: number, next: string) {
    const copy = [...lines];
    copy[i] = next;
    onChange(copy.filter((l, j) => j !== i || l.trim() !== "").join("\n"));
  }
  function removeLine(i: number) {
    onChange(lines.filter((_, j) => j !== i).join("\n"));
  }

  const hint = placeholder?.[Math.min(lines.length, (placeholder?.length ?? 1) - 1)] ?? "";

  return (
    <div>
      <span className="block text-[12.5px] text-[rgba(26,26,26,.62)] mb-1.5">{label}</span>
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[rgba(26,26,26,.3)] font-barlow text-[13px] shrink-0">•</span>
            <input
              value={l}
              onChange={(e) => editLine(i, e.target.value)}
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={() => removeLine(i)}
              aria-label="Remove line"
              className="shrink-0 text-[rgba(26,26,26,.35)] hover:text-ops-danger px-1"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="text-[rgba(26,26,26,.2)] font-barlow text-[13px] shrink-0">•</span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitDraft(); }
            }}
            placeholder={hint}
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={commitDraft}
            disabled={!draft.trim()}
            className="shrink-0 text-[12px] font-barlowc uppercase tracking-[0.06em] text-ops-accent disabled:text-[rgba(26,26,26,.25)] px-1"
          >
            {addLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
