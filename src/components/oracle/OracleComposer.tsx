"use client";

import { ArrowUp } from "lucide-react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Spinner } from "@/components/ui/button";
import { MAX_MESSAGE_CHARS } from "@/lib/coach/schema";
import { cn } from "@/lib/cn";

export interface ComposerHandle {
  focus: () => void;
}

/**
 * Coach's composer (docs/DESIGN-V3-SIMPLE.md §4.8): "Ask anything" in a --card pill that grows to
 * five lines, with a 44 px white send (never gold: the question is his).
 */
export const OracleComposer = forwardRef<
  ComposerHandle,
  { value: string; onChange: (v: string) => void; onSend: () => void; busy?: boolean; disabled?: boolean; placeholder?: string; id?: string; max?: number }
>(function OracleComposer({ value, onChange, onSend, busy, disabled, placeholder = "Ask anything", id = "coach-composer", max = MAX_MESSAGE_CHARS }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 140)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !busy && !disabled;
  const near = value.length > max - 200;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      onClick={(e) => e.target === e.currentTarget && ta.current?.focus()}
      className={cn(
        "flex min-h-14 items-end gap-1.5 rounded-sheet bg-card py-1.5 pl-5 pr-1.5 transition-shadow duration-(--dur-fast)",
        !disabled && "focus-within:shadow-[inset_0_0_0_2px_var(--text)]",
      )}
    >
      <label className="sr-only" htmlFor={id}>
        Ask coach
      </label>
      <textarea
        id={id}
        ref={ta}
        rows={1}
        value={value}
        disabled={disabled}
        maxLength={max}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={placeholder}
        enterKeyHint="send"
        autoComplete="off"
        autoCorrect="on"
        spellCheck
        className="t-body min-h-11 flex-1 resize-none bg-transparent py-2.5 leading-snug text-fg outline-none placeholder:text-fg-2 disabled:cursor-not-allowed"
      />
      {near && (
        <span className="t-cap mb-3 shrink-0 tabular-nums" aria-live="polite">
          {value.length}/{max}
        </span>
      )}
      <button
        type="submit"
        disabled={!canSend}
        aria-label={busy ? "Sending" : "Send"}
        className={cn(
          "press grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-(--dur-fast)",
          disabled ? "bg-card-3 text-fg-3" : "bg-fg text-bg disabled:opacity-60",
        )}
      >
        {busy ? <Spinner className="size-[1.125rem]" /> : <ArrowUp className="size-5" strokeWidth={2.2} aria-hidden />}
      </button>
    </form>
  );
});
