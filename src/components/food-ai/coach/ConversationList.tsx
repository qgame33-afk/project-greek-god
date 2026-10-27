"use client";

import { useState } from "react";
import { SquarePen, Trash } from "lucide-react";
import { Confirm } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { localDateOf, relativeDay } from "@/lib/dates";
import type { AIConversation } from "../hooks";

/** The Food Coach's chats (saved to the account): a sheet on phones, a column from 768 px. */
export function ConversationList({
  conversations,
  loading,
  activeId,
  onOpen,
  onNew,
  onDelete,
}: {
  conversations: AIConversation[];
  loading: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const target = conversations.find((c) => c.id === confirmId);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button
        type="button"
        onClick={onNew}
        className="press t-label flex h-12 shrink-0 items-center justify-center gap-2 rounded-pill bg-card-2 font-semibold text-fg hover:bg-card-3"
      >
        <SquarePen className="size-[1.125rem]" strokeWidth={1.6} aria-hidden />
        New chat
      </button>
      <p className="t-label mb-1 mt-5 font-semibold">Recent</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-field" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="t-label py-3">Your food chats appear here. They&apos;re saved to your account.</p>
        ) : (
          <ul className="[&>li+li]:border-t [&>li+li]:border-line">
            {conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className={cn("relative flex items-center", active && "rounded-tile bg-card")}>
                  {active && <span className="absolute left-0 top-3 h-8 w-0.5 rounded-full bg-fg" aria-hidden />}
                  <button type="button" onClick={() => onOpen(c.id)} aria-current={active ? "true" : undefined} className="press-soft min-h-14 min-w-0 flex-1 py-2 pl-3 pr-1 text-left">
                    <span className={cn("t-label block truncate font-semibold", active ? "text-fg" : "text-fg-2")}>{c.title || "Food chat"}</span>
                    <span className="t-cap block">{relativeDay(localDateOf(c.updated_at))}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(c.id)}
                    aria-label={`Delete chat: ${c.title || "Food chat"}`}
                    className="press grid size-11 shrink-0 place-items-center rounded-field text-fg-3 hover:text-danger focus-visible:text-danger"
                  >
                    <Trash className="size-4" strokeWidth={1.6} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Confirm
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Delete this chat?"
        body={<>“{target?.title || "Food chat"}” and its photos are removed from your account. Anything you already logged stays in your diary.</>}
        confirmLabel="Delete"
        onConfirm={() => confirmId && onDelete(confirmId)}
      />
    </div>
  );
}
