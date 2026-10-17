"use client";

import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { OracleSparkles } from "@/components/art/icons";
import { Chip } from "@/components/ui/controls";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import type { AIQuestion, FoodChatPayload } from "@/lib/ai/food-schemas";
import { usdaDownNote } from "@/lib/ai/lookup-note";
import { useMealPhotoUrl, type AIMessage } from "../hooks";
import { DevMockBadge } from "../parts";
import { MealDraftCard, type GroupInfo } from "./MealDraftCard";

const md: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ivory">{children}</strong>,
  em: ({ children }) => <em className="text-ivory">{children}</em>,
  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 marker:text-ash last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 marker:text-ash last:mb-0">{children}</ol>,
  // links are stripped on the server; never render one from model text
  a: ({ children }) => <span>{children}</span>,
  code: ({ children }) => <code className="t-meta rounded-tag bg-m3 px-1 py-0.5">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="t-callout">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-vein-2 px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="tnum border-b border-vein px-2 py-1">{children}</td>,
};

/** The Food Coach's words (Instrument, stone; bold in ivory). */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="t-body text-stone [overflow-wrap:anywhere]">
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
        <div className="h-40 w-52 overflow-hidden rounded-card bg-m3 shadow-[inset_0_0_0_1px_var(--vein-2)]">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- private signed URL / local preview
            <img src={src} alt="Attached meal photo" className="size-full object-cover" />
          )}
        </div>
      )}
      <div className="t-body max-w-[86%] whitespace-pre-wrap break-words rounded-card rounded-br-tag bg-m3 px-4 py-2.5 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)]">{text}</div>
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
    <article aria-label="The Oracle's answer">
      <div className="flex items-center gap-2">
        <OracleSparkles className="size-4 text-aegean" />
        <Tag kind="AI" />
        {payload?.mock && <DevMockBadge />}
      </div>
      <div className="mt-2.5">
        <Markdown text={message.content} />
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
      {hasDraft && (payload!.notes?.length || usdaNote) ? <p className="t-meta mt-2 text-stone">{[...(payload!.notes ?? []), usdaNote].filter(Boolean).join(" ")}</p> : null}
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
    <div className="mt-4 space-y-4 border-t border-vein pt-3.5">
      {questions.map((q) => (
        <div key={q.id}>
          <p className="t-callout font-semibold text-ivory">{q.question}</p>
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
        <button type="button" onClick={() => send(picked)} className="press t-callout h-11 font-semibold text-ivory underline decoration-ui-line underline-offset-4">
          Send answers
        </button>
      )}
    </div>
  );
}
