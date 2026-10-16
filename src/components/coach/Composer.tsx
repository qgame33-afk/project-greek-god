"use client";

import { ArrowUp } from "lucide-react";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Spinner } from "@/components/ui/button";
import { MAX_MESSAGE_CHARS } from "@/lib/coach/schema";
import { cn } from "@/lib/cn";

export interface ComposerHandle {
  focus: () => void;
}

const LINE = 22;
const MAX_LINES = 5;

/** 52px pill that grows to 5 lines, with a gold-leaf send disc (gold only when there's text). */
export const Composer = forwardRef<
  ComposerHandle,
  { value: string; onChange: (v: string) => void; onSend: () => void; busy?: boolean; disabled?: boolean; placeholder?: string }
>(function Composer({ value, onChange, onSend, busy, disabled, placeholder = "Ask your coach" }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }), []);

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 40), LINE * MAX_LINES + 18)}px`;
  }, [value]);

  const canSend = value.trim().length > 0 && !busy && !disabled;
  const near = value.length > MAX_MESSAGE_CHARS - 200;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      className={cn(
        "flex items-end gap-1 rounded-[26px] border bg-s2 py-1.5 pl-4 pr-1.5 shadow-[var(--e2)] transition-colors",
        disabled ? "border-line" : "border-line-strong focus-within:border-gold-600",
      )}
    >
      <label className="sr-only" htmlFor="coach-composer">
        Message Coach
      </label>
      <textarea
        id="coach-composer"
        ref={ta}
        rows={1}
        value={value}
        disabled={disabled}
        maxLength={MAX_MESSAGE_CHARS}
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
        className="min-h-10 flex-1 resize-none bg-transparent py-[9px] text-[16px] leading-[22px] text-fg outline-none placeholder:text-fg-3 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-fg-3"
      />
      {near && (
        <span className="num mb-3 shrink-0 text-[12px] text-fg-3" aria-live="polite">
          {value.length}/{MAX_MESSAGE_CHARS}
        </span>
      )}
      <button
        type="submit"
        disabled={!canSend}
        aria-label={busy ? "Sending" : "Send"}
        className={cn(
          "press relative grid size-10 shrink-0 place-items-center rounded-full transition-[background-color,color,opacity] duration-150 before:absolute before:-inset-0.5 before:content-['']",
          canSend ? "bg-[image:var(--grad-leaf)] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/.45),var(--glow-cta)]" : "bg-s4 text-fg-dis",
        )}
      >
        {busy ? <Spinner className="size-[18px] text-fg-2" /> : <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />}
      </button>
    </form>
  );
});
