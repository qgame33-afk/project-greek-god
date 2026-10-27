"use client";

import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Chip } from "@/components/ui/controls";
import { AiChip } from "@/components/ui/ai-chip";
import { cn } from "@/lib/cn";
import type { AIQuestion, FoodChatPayload } from "@/lib/ai/food-schemas";
import { usdaDownNote } from "@/lib/ai/lookup-note";
import { useMealPhotoUrl, type AIMessage } from "../hooks";
import { DevMockBadge } from "../parts";
import { MealDraftCard, type GroupInfo } from "./MealDraftCard";

const md: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
  em: ({ children }) => <span className="text-fg">{children}</span>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-fg-3 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 marker:text-fg-3 last:mb-0">{children}</ol>,
  // links are stripped on the server; never render one from model text
  a: ({ children }) => <span>{children}</span>,
  code: ({ children }) => <code className="t-label rounded-md bg-card-3 px-1 py-0.5">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="t-label">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="tabular-nums border-b border-line px-2 py-1">{children}</td>,
};

/** The food coach's words: plain body text in --text-2, bold in --text. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="t-body text-fg-2 [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={md} skipHtml disallowedElements={["img"]} unwrapDisallowed>
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function UserBubble({ text, imagePath, localImage, pending }: { text: string; imagePath?: string | null; localImage?: string | null; pending?: boolean }) {
  const url = useMealPhotoUrl(localImage ? null : imagePath);
  const src = localImage ?? url.data;
  return (
    <div className={cn("flex flex-col items-end gap-1.5", pending && "opacity-80")}>
      {(src || imagePath) && (
        <div className="h-40 w-52 overflow-hidden rounded-tile-lg bg-card-2">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL / local preview
            <img src={src} alt="Attached meal photo" className="size-full object-cover" />
          )}
        </div>
      )}
      <div className="t-body max-w-[86%] whitespace-pre-wrap break-words rounded-tile-lg rounded-br-md bg-card-2 px-4 py-3 text-fg">{text}</div>
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
    <article aria-label="Coach's answer">
      <div className="rounded-card bg-card p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <AiChip label="AI" />
          {payload?.mock && <DevMockBadge />}
        </div>
        <div className="mt-3" data-ai-answer="" data-budget-group="">
          <Markdown text={message.content} />
        </div>
      </div>
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
      {hasDraft && (payload!.notes?.length || usdaNote) ? <p className="t-cap mt-2" data-food="">{[...(payload!.notes ?? []), usdaNote].filter(Boolean).join(" ")}</p> : null}
      {latest && payload?.questions?.length ? <Questions questions={payload.questions} onSend={onSend} /> : null}
    </article>
  );
});

/** Clarifying questions as chips; answers are sent together (automatically once all are picked). */
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
    <div className="mt-4 space-y-4">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="t-row" data-ai-answer="">{q.question}</p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={q.question}>
            {q.options.map((o) => (
              <Chip key={o} selected={picked[q.id] === o} onClick={() => pick(q, o)}>
                {o}
              </Chip>
            ))}
          </div>
        </div>
      ))}
      {some && questions.length > 1 && !questions.every((q) => picked[q.id]) && (
        <button type="button" onClick={() => send(picked)} className="press t-label h-11 font-semibold text-fg underline decoration-ui-line underline-offset-4">
          Send answers
        </button>
      )}
    </div>
  );
}
