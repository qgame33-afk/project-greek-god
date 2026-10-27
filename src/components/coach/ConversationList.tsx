"use client";

import { SquarePen, Trash } from "lucide-react";
import { useState } from "react";
import { Confirm } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/misc";
import { useConversations, useDeleteConversation, type Conversation } from "@/lib/coach/hooks";
import { localDateOf, relativeDay, today } from "@/lib/dates";
import { cn } from "@/lib/cn";

function when(ts: string) {
  const d = localDateOf(ts);
  const rel = relativeDay(d, today());
  if (rel === "Today") return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return rel;
}

/** A title the server derived from the first question, without its "[About: …]" prefix. */
export function convTitle(t: string | null) {
  return (t ?? "").replace(/^\[About: [^\]]*\]\s*/, "").trim() || "Conversation";
}

/** The Oracle's conversation history (synced per account): a sheet on phones, a column on desktop. */
export function ConversationList({
  currentId,
  onSelect,
  onNew,
  onDeleted,
  disabled,
  className,
}: {
  currentId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const q = useConversations();
  const { del } = useDeleteConversation();
  const [confirm, setConfirm] = useState<Conversation | null>(null);
  const list = q.data ?? [];

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="press t-callout flex h-12 shrink-0 items-center justify-center gap-2 rounded-pill bg-card-2 font-semibold text-fg hover:bg-card-3 disabled:opacity-50"
      >
        <SquarePen className="size-[1.125rem]" strokeWidth={1.6} aria-hidden />
        New question
      </button>
      <p className="t-label mb-1 mt-5 font-semibold">History</p>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
        {q.isPending ? (
          <div className="space-y-2 pt-1" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-field" />
            ))}
          </div>
        ) : q.error ? (
          <p className="t-label py-3">
            Couldn&apos;t load your conversations.{" "}
            <button type="button" className="press inline-flex h-11 items-center font-semibold text-fg underline decoration-ui-line underline-offset-4" onClick={() => q.refetch()}>
              Retry
            </button>
          </p>
        ) : !list.length ? (
          <p className="t-label py-3">No conversations yet. Questions you ask are kept here and on every device you sign in to.</p>
        ) : (
          <ul className="[&>li+li]:border-t [&>li+li]:border-line">
            {list.map((c) => {
              const active = c.id === currentId;
              return (
                <li key={c.id} className={cn("relative flex items-center", active && "rounded-tile bg-card")}>
                  {active && <span className="absolute left-0 top-3 h-8 w-0.5 rounded-full bg-fg" aria-hidden />}
                  <button type="button" onClick={() => onSelect(c.id)} aria-current={active ? "true" : undefined} className="press-soft min-h-14 min-w-0 flex-1 py-2 pl-3 pr-1 text-left">
                    <span className={cn("t-callout block truncate font-semibold", active ? "text-fg" : "text-fg-2")}>{convTitle(c.title)}</span>
                    <span className="t-cap mt-0.5 block">{when(c.updated_at)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(c)}
                    aria-label={`Delete conversation: ${convTitle(c.title)}`}
                    className="press grid size-11 shrink-0 place-items-center rounded-field text-fg-3 hover:text-danger focus-visible:text-danger"
                  >
                    <Trash className="size-4" strokeWidth={1.6} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Confirm
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this conversation?"
        body="Its messages are removed from every device. You can undo for a few seconds."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!confirm) return;
          del.mutate(confirm);
          onDeleted(confirm.id);
        }}
      />
    </div>
  );
}
