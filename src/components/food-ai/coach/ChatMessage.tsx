"use client";

import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/cn";
import type { AIQuestion, FoodChatPayload } from "@/lib/ai/food-schemas";
import { usdaDownNote } from "@/lib/ai/lookup-note";
import { useMealPhotoUrl, type AIMessage } from "../hooks";
import { CoachAvatar } from "../parts";
import { MealDraftCard, type GroupInfo } from "./MealDraftCard";

const md: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-bold text-fg">{children}</strong>,
  em: ({ children }) => <em className="text-fg">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-fg-3 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 marker:text-fg-3 last:mb-0">{children}</ol>,
  // links are stripped on the server; never render one from model text
  a: ({ children }) => <span>{children}</span>,
  code: ({ children }) => <code className="rounded bg-s3 px-1 py-0.5 text-[13px]">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-line-hair px-2 py-1">{children}</td>,
};

export function Markdown({ text }: { text: string }) {
  return (
    <div className="text-[15px] leading-[1.55] text-fg-2">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} skipHtml disallowedElements={["img"]} unwrapDisallowed>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function UserBubble({
  text,
  imagePath,
  localImage,
  pending,
}: {
  text: string;
  imagePath?: string | null;
  localImage?: string | null;
  pending?: boolean;
}) {
  const url = useMealPhotoUrl(localImage ? null : imagePath);
  const src = localImage ?? url.data;
  return (
    <div className={cn("flex flex-col items-end gap-1.5", pending && "opacity-80")}>
      {(src || imagePath) && (
        <div className="h-40 w-52 overflow-hidden rounded-[18px] border border-line bg-s3">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL / local preview
            <img src={src} alt="Attached meal photo" className="size-full object-cover" />
          )}
        </div>
      )}
      <div className="max-w-[82%] whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] bg-s4 px-3.5 py-2.5 text-[15px] leading-[1.5] text-fg">
        {text}
      </div>
    </div>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  conversationId,
  userText,
  latest,
  superseded,
  replacesGroup,
  group,
  groupsLoaded,
  onSend,
}: {
  message: AIMessage;
  conversationId: string | null;
  userText: string;
  latest: boolean;
  superseded: boolean;
  replacesGroup: string | null;
  group: GroupInfo | null;
  groupsLoaded: boolean;
  onSend: (text: string) => void;
}) {
  const payload = message.payload as unknown as FoodChatPayload | null;
  const hasDraft = !!payload?.items?.length;
  const usdaNote = hasDraft ? usdaDownNote(payload!.lookup?.usda, payload!.items, "chat") : null;
  return (
    <div className="flex gap-2.5">
      <CoachAvatar />
      <div className="min-w-0 max-w-[640px] flex-1 pt-1">
        <Markdown text={message.content} />
        {hasDraft && (
          <MealDraftCard
            message={message}
            payload={payload!}
            conversationId={conversationId}
            userText={userText}
            superseded={superseded}
            replacesGroup={replacesGroup}
            group={group}
            groupsLoaded={groupsLoaded}
            latest={latest}
            onSend={onSend}
          />
        )}
        {hasDraft && (payload!.notes?.length || usdaNote) ? (
          <p className="mt-2 text-[12px] leading-relaxed text-fg-3">
            {[...(payload!.notes ?? []), usdaNote]
              .filter(Boolean)
              .join(" ")}
          </p>
        ) : null}
        {latest && payload?.questions?.length ? <Questions questions={payload.questions} onSend={onSend} /> : null}
      </div>
    </div>
  );
});

/** Clarifying questions as lapis chips; answers are sent together (auto when all are picked). */
function Questions({ questions, onSend }: { questions: AIQuestion[]; onSend: (text: string) => void }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const send = (sel: Record<string, string>) => {
    const parts = questions.filter((q) => sel[q.id]).map((q) => (questions.length > 1 ? `${q.question} ${sel[q.id]}.` : sel[q.id]));
    if (parts.length) onSend(parts.join(" "));
  };
  const pick = (q: AIQuestion, o: string) => {
    const next = { ...picked, [q.id]: o };
    setPicked(next);
    if (questions.every((x) => next[x.id])) send(next);
  };
  const some = Object.keys(picked).length > 0;
  return (
    <div className="mt-3 space-y-3 rounded-[16px] border border-lapis-line bg-lapis-tint p-3.5">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="text-[14px] font-semibold text-fg">{q.question}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={q.question}>
            {q.options.map((o) => {
              const on = picked[q.id] === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pick(q, o)}
                  className={cn(
                    "press inline-flex h-11 items-center rounded-full border px-4 text-[14px] font-semibold transition-colors",
                    on ? "border-lapis bg-lapis/20 text-fg" : "border-lapis-line bg-bg/40 text-lapis-text hover:bg-lapis/10",
                  )}
                >
                  {o}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {some && questions.length > 1 && !questions.every((q) => picked[q.id]) && (
        <button type="button" onClick={() => send(picked)} className="h-11 text-[13px] font-bold text-lapis-text">
          Send answers
        </button>
      )}
    </div>
  );
}
