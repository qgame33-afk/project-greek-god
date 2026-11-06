"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/field";

/** A search field with a clear button (56 px, the kit's Input). */
export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-fg-2" strokeWidth={1.9} aria-hidden />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="pl-12 pr-11"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="press absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center text-fg-2 hover:text-fg">
          <X className="size-5" strokeWidth={1.9} aria-hidden />
        </button>
      )}
    </div>
  );
}
