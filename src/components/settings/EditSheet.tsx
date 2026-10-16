"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ErrorNote } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";

/** A settings edit sheet: content, then a sticky Save that guards double taps. */
export function EditSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSave,
  canSave = true,
  pending,
  error,
  saveLabel = "Save",
  wide,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  onSave: () => void;
  canSave?: boolean;
  pending?: boolean;
  error?: string | null;
  saveLabel?: string;
  wide?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      wide={wide}
      footer={
        <div className="grid grid-cols-1 gap-3">
          {error && <ErrorNote onRetry={onSave}>{error}</ErrorNote>}
          <Button variant="primary" size="lg" block onClick={onSave} disabled={!canSave} loading={pending}>
            {saveLabel}
          </Button>
        </div>
      }
    >
      <form
        className="pt-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave && !pending) onSave();
        }}
      >
        {children}
        {/* lets Enter on the iOS keyboard submit */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          {saveLabel}
        </button>
      </form>
    </Sheet>
  );
}
