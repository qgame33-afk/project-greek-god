"use client";

import { Button } from "@/components/ui/button";
import { HoldButton } from "@/components/ui/hold-button";
import { Sheet } from "@/components/ui/sheet";

/**
 * The Seal panel (§3.2.7): what Finish opens — not bookkeeping. `14 of 17 sets logged`, one
 * inline row when sets are unlogged ("they're dropped when you seal" · Log them first), and the
 * hold bar: hold 600 ms, or tap / VoiceOver / Switch Control / Enter for a two-button confirm.
 * With nothing logged it offers Keep training / Discard. The seal runs the existing finish()
 * path unchanged; its errors (offline, server) show inline here.
 */
export function SealPanel({
  open,
  onOpenChange,
  name,
  logged,
  planned,
  unlogged,
  saving,
  error,
  onSeal,
  onLogFirst,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  logged: number;
  planned: number;
  unlogged: number;
  saving: boolean;
  error: string | null;
  onSeal: () => void;
  onLogFirst: () => void;
  onDiscard: () => void;
}) {
  const none = logged === 0;
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={none ? "Nothing logged yet" : `Seal ${name}`}
      description={none ? "Log at least one set to seal this session" : "Hold the bar, or tap it to confirm"}
      footer={
        none ? (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" onClick={() => onOpenChange(false)}>
              Keep training
            </Button>
            <Button variant="destructive" size="lg" onClick={onDiscard}>
              Discard
            </Button>
          </div>
        ) : (
          <HoldButton
            label={saving ? "Sealing…" : "Hold to seal"}
            busy={saving}
            onConfirm={onSeal}
            confirmTitle={`Seal ${name}?`}
            confirmBody={unlogged ? `${unlogged} unlogged ${unlogged === 1 ? "set is" : "sets are"} dropped. Logged sets are kept exactly as entered.` : "Every planned set is logged."}
            confirmLabel="Seal session"
            cancelLabel="Not yet"
            instructions="Press and hold for a moment to seal the session, or tap for a confirm step."
          />
        )
      }
    >
      <div className="pb-2">
        <p className="flex items-baseline gap-2">
          <span className="t-dial text-ivory">{logged}</span>
          <span className="t-callout text-stone">
            of {planned} {planned === 1 ? "set" : "sets"} logged
          </span>
        </p>
        {!none && unlogged > 0 && (
          <div className="mt-4 flex items-center gap-3 border-y border-vein py-3">
            <p className="t-callout min-w-0 flex-1 text-stone">
              <span className="font-semibold text-ivory">
                {unlogged} {unlogged === 1 ? "set" : "sets"} not logged
              </span>{" "}
              · {unlogged === 1 ? "it's" : "they're"} dropped when you seal
            </p>
            <Button variant="outline" size="sm" onClick={onLogFirst}>
              Log them first
            </Button>
          </div>
        )}
        {!none && unlogged === 0 && <p className="t-callout mt-3 text-stone">Every planned set is logged.</p>}
        {saving && <p className="t-meta mt-3 text-stone">Syncing your sets…</p>}
        {error && (
          <p className="t-callout mt-3 rounded-field bg-cinnabar-tint px-3.5 py-3 text-ivory shadow-[inset_0_0_0_1px_var(--cinnabar-line)]" role="alert">
            {error}
          </p>
        )}
        {!none && (
          <button type="button" onClick={onDiscard} className="t-meta mt-4 inline-flex min-h-11 items-center font-semibold text-stone hover:text-cinnabar">
            Discard this workout instead
          </button>
        )}
      </div>
    </Sheet>
  );
}
