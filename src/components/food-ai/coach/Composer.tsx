"use client";

import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/button";

export interface ComposerHandle {
  focus: () => void;
}

/**
 * The Food Coach's field: a 56 px well that grows to five lines, a photo button and a 44 px send
 * disc (ivory when there is something to send).
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
          <div className="relative size-16 overflow-hidden rounded-field bg-m3 shadow-[inset_0_0_0_1px_var(--vein-2)]">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={image} alt="Photo to send" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-stone">
                <Spinner />
              </span>
            )}
          </div>
          {image && (
            <button type="button" onClick={onRemoveImage} className="press t-callout inline-flex h-11 items-center gap-1 px-2 font-semibold text-stone hover:text-ivory" aria-label="Remove photo">
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
          "flex items-end gap-1 rounded-card border bg-m2 py-1.5 pl-1 pr-1.5 transition-[border-color,box-shadow] duration-(--dur-fast)",
          disabled ? "border-vein-2 opacity-70" : "border-ui-line focus-within:border-aegean-line focus-within:shadow-[0_0_0_3px_var(--aegean-tint)]",
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
          className="press grid size-11 shrink-0 place-items-center rounded-full text-stone hover:text-ivory disabled:opacity-40"
        >
          <ImagePlus className="size-5" strokeWidth={1.6} />
        </button>
        <label htmlFor="food-coach-input" className="sr-only">
          Describe what you ate
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
          placeholder={placeholder ?? "Describe what you ate"}
          enterKeyHint="send"
          autoComplete="off"
          className="min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[length:max(16px,1rem)] leading-snug text-ivory outline-none placeholder:text-ash disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={sending ? "Sending" : "Send"}
          className={cn("press grid size-11 shrink-0 place-items-center rounded-full transition-[background-color,color] duration-(--dur-fast)", canSend ? "bg-ivory text-ink" : "bg-m3 text-disabled")}
        >
          {sending ? <Spinner className="size-[1.125rem] text-stone" /> : <ArrowUp className="size-5" strokeWidth={2.2} />}
        </button>
      </form>
    </div>
  );
});
