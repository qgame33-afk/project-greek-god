"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { ArrowUp, ImagePlus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/button";

export interface ComposerHandle {
  focus: () => void;
}

/** 52px pill that grows to 5 lines, photo button, gold-leaf send disc (gold only when sendable). */
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

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 22 * 5 + 20)}px`;
  }, [value]);

  const canSend = !disabled && !sending && value.trim().length > 0;

  return (
    <div>
      {(image || preparingImage) && (
        <div className="mb-2 flex items-center gap-2">
          <div className="relative size-16 overflow-hidden rounded-[12px] border border-line bg-s3">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview
              <img src={image} alt="Photo to send" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-fg-3">
                <Spinner />
              </span>
            )}
          </div>
          {image && (
            <button
              type="button"
              onClick={onRemoveImage}
              className="inline-flex h-11 items-center gap-1 px-2 text-[13px] font-bold text-fg-2 hover:text-fg"
              aria-label="Remove photo"
            >
              <X className="size-4" />
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
          "flex items-end gap-1.5 rounded-[26px] border border-line-strong bg-s2 p-1 transition-colors focus-within:border-gold-400/60",
          disabled && "opacity-60",
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
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-white/5 hover:text-fg disabled:opacity-40"
        >
          <ImagePlus className="size-[21px]" />
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
          className="min-h-11 flex-1 resize-none bg-transparent py-[11px] text-[16px] leading-[22px] text-fg outline-none placeholder:text-fg-3"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          className={cn(
            "press grid size-11 shrink-0 place-items-center rounded-full transition-colors",
            canSend ? "bg-[image:var(--grad-leaf)] text-ink shadow-[inset_0_1px_0_rgb(255_255_255/.45)]" : "bg-s4 text-fg-dis",
          )}
        >
          {sending ? <Spinner /> : <ArrowUp className="size-5" strokeWidth={2.4} />}
        </button>
      </form>
    </div>
  );
});
