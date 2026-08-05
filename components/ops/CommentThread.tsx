"use client";

// Comments on an issue or an action item. Collapsed to a count until opened,
// because most rows have none and an always-open composer under every row
// would bury the list it belongs to.
import { useState, useTransition } from "react";
import { addEntityComment, removeEntityComment, type CommentEntity, type EntityComment } from "@/lib/actions/comments";
import { btnPrimary, inputCls } from "@/components/ops/Bits";

const when = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function CommentThread({
  entityType,
  entityId,
  initial,
}: {
  entityType: CommentEntity;
  entityId: string;
  initial: EntityComment[];
}) {
  const [comments, setComments] = useState(initial);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  function add() {
    const t = body.trim();
    if (!t) return;
    setErr("");
    start(async () => {
      const r = await addEntityComment(entityType, entityId, t);
      if ("error" in r && r.error) { setErr(r.error); return; }
      if ("comment" in r && r.comment) setComments((c) => [...c, r.comment]);
      setBody("");
    });
  }

  function remove(id: string) {
    setComments((c) => c.filter((x) => x.id !== id));
    start(async () => { await removeEntityComment(id); });
  }

  return (
    <div className="mt-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[11.5px] font-barlowc uppercase tracking-[0.06em] text-[rgba(26,26,26,.45)] hover:text-ops-text"
      >
        {comments.length > 0 ? `${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Comment"}
        <span className="ml-1">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-2 pl-3 border-l border-ops-divider space-y-2">
          {err && <p className="text-[12.5px] text-ops-danger">{err}</p>}
          {comments.map((c) => (
            <div key={c.id} className="group flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-barlow text-[13.5px] leading-snug">{c.body}</p>
                <p className="text-[11px] text-[rgba(26,26,26,.45)] font-barlow mt-0.5">
                  {c.author ?? "Someone"} · {when(c.created_at)}
                </p>
              </div>
              <button
                onClick={() => remove(c.id)}
                aria-label="Delete comment"
                className="shrink-0 text-[rgba(26,26,26,.25)] hover:text-ops-danger"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <input
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
              placeholder="Add a comment…"
              className={`${inputCls} flex-1`}
            />
            <button className={btnPrimary} disabled={!body.trim() || pending} onClick={add}>
              Post
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
