"use client";

import { useState } from "react";
import { MessageSquareText, SquarePen, Trash } from "lucide-react";
import { Confirm } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { localDateOf, relativeDay } from "@/lib/dates";
import type { AIConversation } from "../hooks";

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
        className="press-soft mb-2 flex h-11 shrink-0 items-center gap-2.5 rounded-[12px] px-3 text-[14px] font-bold text-gold-300 hover:bg-gold-tint"
      >
        <SquarePen className="size-[18px]" />
        New chat
      </button>
      <p className="eyebrow px-3 pb-2 pt-1">Recent</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <p className="px-3 py-4 text-[13px] leading-relaxed text-fg-3">Your food chats appear here. They&apos;re saved to your account.</p>
        ) : (
          <ul className="space-y-0.5">
            {conversations.map((c) => {
              const active = c.id === activeId;
              return (
                <li key={c.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[12px] py-2.5 pl-3 pr-12 text-left transition-colors",
                      active ? "bg-s3 text-fg" : "text-fg-2 hover:bg-white/[.03] hover:text-fg",
                    )}
                  >
                    <MessageSquareText className={cn("size-4 shrink-0", active ? "text-gold-400" : "text-fg-3")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{c.title || "Food chat"}</span>
                      <span className="block text-[12px] text-fg-3">{relativeDay(localDateOf(c.updated_at))}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmId(c.id)}
                    aria-label={`Delete chat: ${c.title || "Food chat"}`}
                    className="absolute right-1 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-[10px] text-fg-3 opacity-100 hover:text-fg md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                  >
                    <Trash className="size-4" />
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
