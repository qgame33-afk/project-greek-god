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

/** Conversation history (synced per account). Used in a sheet on phones and as a column on desktop. */
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
        className="press flex h-12 shrink-0 items-center justify-center gap-2 rounded-[14px] border border-line-gold text-[15px] font-bold text-gold-300 hover:bg-gold-tint disabled:opacity-50"
      >
        <SquarePen className="size-[18px]" aria-hidden />
        New conversation
      </button>
      <p className="eyebrow mb-1 mt-5 px-1">History</p>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-2">
        {q.isPending ? (
          <div className="space-y-2 pt-1" aria-label="Loading conversations">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 rounded-[12px]" />
            ))}
          </div>
        ) : q.error ? (
          <p className="px-1 py-3 text-[13px] text-fg-2">
            Couldn&apos;t load your conversations.{" "}
            <button type="button" className="font-bold text-gold-300" onClick={() => q.refetch()}>
              Retry
            </button>
          </p>
        ) : !list.length ? (
          <p className="px-1 py-3 text-[13px] leading-relaxed text-fg-3">No conversations yet. Questions you ask are saved here and on every device you sign in to.</p>
        ) : (
          <ul className="space-y-0.5">
            {list.map((c) => {
              const active = c.id === currentId;
              return (
                <li key={c.id} className={cn("group relative flex items-center rounded-[12px] transition-colors", active ? "bg-s3" : "hover:bg-white/[.03]")}>
                  {active && <span className="absolute left-0 top-3 h-8 w-[2px] rounded-full bg-gold-400" aria-hidden />}
                  <button
                    type="button"
                    onClick={() => onSelect(c.id)}
                    aria-current={active ? "true" : undefined}
                    className="min-h-14 min-w-0 flex-1 py-2 pl-3.5 pr-1 text-left"
                  >
                    <span className={cn("block truncate text-[14.5px] font-semibold", active ? "text-fg" : "text-fg-2 group-hover:text-fg")}>{c.title || "Conversation"}</span>
                    <span className="mt-0.5 block text-[12px] font-medium text-fg-3">{when(c.updated_at)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(c)}
                    aria-label={`Delete conversation: ${c.title ?? "Conversation"}`}
                    className="grid size-11 shrink-0 place-items-center rounded-[10px] text-fg-3 hover:text-danger focus-visible:text-danger"
                  >
                    <Trash className="size-4" aria-hidden />
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
