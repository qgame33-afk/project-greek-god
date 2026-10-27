"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/button";

export interface ComposerHandle {
  focus: () => void;
}

/**
 * The food coach's composer (docs/DESIGN-V3-SIMPLE.md §4.8): "Ask anything" in a --card pill that
 * grows to five lines, a photo button and a 44 px white send.
 */
export const Composer = forwardRef<
  ComposerHandle,
  {
    value: string;
    onChange: (v: string) => void;
    onSend: () => void;
    onPickImage: (f: File) => void;
    onRemoveImage: () => void;
    image: string | null;
    preparingImage?: boolean;
    disabled?: boolean;
    sending?: boolean;
    placeholder?: string;
  }
>(function Composer({ value, onChange, onSend, onPickImage, onRemoveImage, image, preparingImage, disabled, sending, placeholder }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => ta.current?.focus() }));

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 140)}px`;
  }, [value]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <div>
      {(image || preparingImage) && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative size-16 overflow-hidden rounded-tile bg-card-2">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={image} alt="Photo to send" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-2">
                <Spinner />
              </span>
            )}
          </div>
          {image && (
            <button type="button" onClick={onRemoveImage} className="press t-label inline-flex h-11 items-center gap-1 px-2 font-semibold hover:text-fg" aria-label="Remove photo">
              <X className="size-4" strokeWidth={1.8} />
              Remove
            </button>
          )}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className={cn(
          "flex min-h-14 items-end gap-1 rounded-sheet bg-card py-1.5 pl-1.5 pr-1.5 transition-shadow duration-(--dur-fast)",
          disabled ? "opacity-70" : "focus-within:shadow-[inset_0_0_0_2px_var(--text)]",
        )}
      >
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) onPickImage(f);
          }}
        />
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={disabled}
          aria-label="Attach a meal photo"
          className="press grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:text-fg disabled:opacity-40"
        >
          <ImagePlus className="size-5" strokeWidth={1.9} />
        </button>
        <label htmlFor="food-coach-input" className="sr-only">
          Ask coach about food
        </label>
        <textarea
          id="food-coach-input"
          ref={ta}
          rows={1}
          value={value}
          disabled={disabled}
          maxLength={1000}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={placeholder ?? "Ask anything"}
          enterKeyHint="send"
          autoComplete="off"
          className="t-body min-h-11 flex-1 resize-none bg-transparent py-2.5 leading-snug text-fg outline-none placeholder:text-fg-2 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? "Sending" : "Send"}
          className={cn("press grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-(--dur-fast)", disabled ? "bg-card-3 text-fg-3" : "bg-fg text-bg disabled:opacity-60")}
        >
          {sending ? <Spinner className="size-[1.125rem]" /> : <ArrowUp className="size-5" strokeWidth={2.2} />}
        </button>
      </form>
    </div>
  );
});
