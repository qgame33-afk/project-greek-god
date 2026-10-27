"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ClipboardPaste, Copy, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EstimateBadge, SourceBadge } from "@/components/ui/badge";
import { Collapse, ErrorNote } from "@/components/ui/misc";
import { cn } from "@/lib/cn";
import { MEALS, mealForTime, type Meal } from "@/lib/nutrition";
import { useToday } from "@/lib/data/core";
import {
  ASSISTANT_LABEL,
  buildHandoffPrompt,
  countryFromLocale,
  handoffUrl,
  hostOf,
  parseHandoffResult,
  type HandoffAssistant,
  type HandoffItem,
  type HandoffItemInput,
} from "@/lib/food/handoff";
import { round, tidyMacros, unitLabel } from "@/lib/food/normalize";
import { MacroTrio, MealDatePicker, fmtKcal } from "../parts";

export interface HandoffConfirm {
  items: HandoffItem[];
  assistant: HandoffAssistant;
  restaurant: string | null;
  meal: Meal;
  date: string;
}

/**
 * "Get the published numbers": hand a precise request to ChatGPT or Claude (which can
 * browse), then paste their fenced JSON back for review. We never fetched those pages, so
 * every link is shown as reported by the assistant.
 */
export function HandoffSheet({
  open,
  onOpenChange,
  description,
  items,
  restaurant,
  defaultMeal,
  replacing,
  extraItems = [],
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  description: string;
  items: HandoffItemInput[];
  restaurant: string | null;
  defaultMeal?: Meal;
  /** True when this replaces an estimate that's already in the diary. */
  replacing?: boolean;
  /** Other rows of the same draft that are logged alongside the researched ones. */
  extraItems?: { name: string; macros: { calories: number } }[];
  onConfirm: (c: HandoffConfirm) => Promise<void>;
}) {
  const todayDate = useToday();
  const [country, setCountry] = useState(() => (typeof navigator === "undefined" ? "United States" : countryFromLocale(navigator.language)));
  const [order, setOrder] = useState(() => description.replace(/\bCorrection:\s*/gi, "").trim());
  const [assistant, setAssistant] = useState<HandoffAssistant>("chatgpt");
  const [pasted, setPasted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ items: HandoffItem[]; restaurant: string | null; skipped: number } | null>(null);
  const [meal, setMeal] = useState<Meal>(defaultMeal ?? mealForTime());
  const [date, setDate] = useState(todayDate);
  const [saving, setSaving] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  const prompt = buildHandoffPrompt({ description: order, items, country, restaurant });

  const copy = async (quiet = false) => {
    try {
      await navigator.clipboard.writeText(prompt);
      if (!quiet) toast("Prompt copied");
      return true;
    } catch {
      if (!quiet) toast.error("Couldn't copy. Select the prompt text and copy it.");
      return false;
    }
  };

  const openAssistant = async (a: HandoffAssistant) => {
    setAssistant(a);
    const copied = await copy(true);
    window.open(handoffUrl(a, prompt), "_blank", "noopener,noreferrer");
    toast(`Opened ${ASSISTANT_LABEL[a]}`, { description: copied ? "The prompt is also on your clipboard if it doesn't appear." : undefined });
  };

  const read = () => {
    const r = parseHandoffResult(pasted);
    if (!r.ok) {
      setError(r.error);
      setParsed(null);
      return;
    }
    setError(null);
    setParsed({ items: r.items, restaurant: r.restaurant ?? restaurant, skipped: r.skipped });
  };

  const setQty = (key: string, q: number) =>
    setParsed(
      (p) =>
        p && {
          ...p,
          items: p.items.map((i) => {
            if (i.key !== key) return i;
            const quantity = Math.max(0.25, Math.min(100, round(q, 2)));
            return {
              ...i,
              quantity,
              total: tidyMacros({
                calories: i.perUnit.calories * quantity,
                protein: i.perUnit.protein * quantity,
                carbs: i.perUnit.carbs * quantity,
                fat: i.perUnit.fat * quantity,
              }),
            };
          }),
        },
    );
  const removeItem = (key: string) => setParsed((p) => p && { ...p, items: p.items.filter((i) => i.key !== key) });

  const total = parsed ? parsed.items.reduce((a, i) => a + i.total.calories, 0) : 0;
  const mealName = MEALS.find((m) => m.key === meal)?.label ?? "meal";

  const confirm = async () => {
    if (!parsed?.items.length || saving) return;
    setSaving(true);
    try {
      await onConfirm({ items: parsed.items, assistant, restaurant: parsed.restaurant, meal, date });
      onOpenChange(false);
      setParsed(null);
      setPasted("");
    } catch {
      /* the caller already explained the error; keep everything for a retry */
    } finally {
      setSaving(false);
    }
  };

  const footer = parsed ? (
    <Button variant="primary" size="lg" block onClick={confirm} loading={saving} disabled={!parsed.items.length}>
      {replacing ? "Replace estimate" : `Add to ${mealName}`}
    </Button>
  ) : (
    <Button variant="secondary" block onClick={read} disabled={pasted.trim().length < 10}>
      <ClipboardPaste className="size-[1.125rem]" strokeWidth={1.6} />
      Read pasted result
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Get the published numbers"
      description="Hand it to an assistant that can browse."
      footer={footer}
      wide
    >
      {!parsed ? (
        <div className="space-y-5">
          <ol className="t-callout space-y-1.5 text-stone">
            <li>
              <span className="tnum mr-1.5 font-semibold text-ivory">1</span>Open an assistant with the request below.
            </li>
            <li>
              <span className="tnum mr-1.5 font-semibold text-ivory">2</span>Copy its whole reply, including the <code className="text-ivory">```json</code> block.
            </li>
            <li>
              <span className="tnum mr-1.5 font-semibold text-ivory">3</span>Paste it here and review before anything is logged.
            </li>
          </ol>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
            <Field label="Order details" hint="sent as written">
              {(id) => (
                <Textarea
                  id={id}
                  value={order}
                  onChange={(e) => setOrder(e.target.value)}
                  placeholder="Size, crust, toppings, sauces, how many"
                  autoComplete="off"
                  maxLength={400}
                  className="min-h-[5.5rem]"
                />
              )}
            </Field>
            <Field label="Country" className="sm:self-start">
              {(id) => <Input id={id} value={country} onChange={(e) => setCountry(e.target.value)} autoComplete="country-name" maxLength={60} />}
            </Field>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => openAssistant("chatgpt")}>
              Research in ChatGPT
              <ExternalLink className="size-4 text-ash" strokeWidth={1.6} />
            </Button>
            <Button variant="secondary" onClick={() => openAssistant("claude")}>
              Research in Claude
              <ExternalLink className="size-4 text-ash" strokeWidth={1.6} />
            </Button>
          </div>

          <div className="rounded-field bg-m2 shadow-(--e1)">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-expanded={showPrompt}
                aria-controls="handoff-prompt"
                onClick={() => setShowPrompt((v) => !v)}
                className="press t-callout flex h-11 flex-1 items-center gap-1.5 px-3.5 text-left font-semibold text-stone hover:text-ivory"
              >
                <ChevronDown className={cn("size-4 transition-[rotate] duration-(--dur-base) ease-out", showPrompt && "rotate-180")} />
                {showPrompt ? "Hide the request" : "Show the request"}
              </button>
              <button type="button" onClick={() => void copy()} className="press t-callout inline-flex h-11 items-center gap-1.5 px-3.5 font-semibold text-ivory">
                <Copy className="size-4" strokeWidth={1.6} />
                Copy prompt
              </button>
            </div>
            <Collapse open={showPrompt} id="handoff-prompt">
              <pre className="t-meta max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-vein px-3.5 py-3 text-stone">
                {prompt}
              </pre>
            </Collapse>
          </div>

          <Field label="Paste the result" hint={`from ${ASSISTANT_LABEL[assistant]}`}>
            {(id) => (
              <Textarea
                id={id}
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value);
                  setError(null);
                }}
                placeholder="Paste the assistant's full reply here"
                className="min-h-28 font-mono"
              />
            )}
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="t-callout text-stone">Answer came from</p>
            <Segmented<HandoffAssistant>
              size="sm"
              className="w-48"
              value={assistant}
              onChange={setAssistant}
              ariaLabel="Assistant"
              options={[
                { value: "chatgpt", label: "ChatGPT" },
                { value: "claude", label: "Claude" },
              ]}
            />
          </div>
          <p className="t-meta rounded-field bg-m2 px-3.5 py-2.5 text-stone shadow-(--e1)">
            Reported by {ASSISTANT_LABEL[assistant]}. We didn&apos;t open these pages ourselves, so tap a link to check it before you trust it.
            {parsed.skipped > 0 && ` ${parsed.skipped} item${parsed.skipped > 1 ? "s" : ""} without usable numbers were left out.`}
          </p>
          <ul className="space-y-2.5">
            {parsed.items.map((i) => (
              <li key={i.key} className="rounded-card bg-m2 p-3.5 shadow-(--e1)">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="t-title-3 text-ivory">{i.name}</p>
                    <p className="t-meta text-stone">
                      {fmtKcal(i.perUnit.calories)} kcal per {i.unit}
                      {i.sourceName && i.sourceUrl ? ` · ${i.sourceName}` : ""}
                      {i.notes ? ` · ${i.notes}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-right">
                    <span className="t-num-s text-ivory">{fmtKcal(i.total.calories)}</span>
                    <span className="t-meta ml-1 text-stone">kcal</span>
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {i.sourceUrl ? (
                    <SourceBadge name={`${hostOf(i.sourceUrl)} · via ${ASSISTANT_LABEL[assistant]} ↗`} url={i.sourceUrl} />
                  ) : (
                    <EstimateBadge>Estimate · via {ASSISTANT_LABEL[assistant]}</EstimateBadge>
                  )}
                  <MacroTrio m={i.total} />
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-vein pt-3">
                  <span className="t-callout font-semibold text-stone">Quantity</span>
                  <div className="ml-auto flex items-center gap-2">
                    <QtyBtn label={`Fewer ${i.name}`} onClick={() => setQty(i.key, i.quantity - 1)} disabled={i.quantity <= 1}>
                      −
                    </QtyBtn>
                    <span className="t-num-s min-w-[4ch] text-center text-ivory">
                      {i.quantity} <span className="t-meta text-stone">{unitLabel(i.quantity, i.unit)}</span>
                    </span>
                    <QtyBtn label={`More ${i.name}`} onClick={() => setQty(i.key, i.quantity + 1)}>
                      +
                    </QtyBtn>
                  </div>
                  <button type="button" onClick={() => removeItem(i.key)} className="press t-callout h-11 px-2 font-semibold text-stone hover:text-ivory">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {extraItems.length > 0 && (
            <p className="t-meta text-stone">
              Also logged from the draft: {extraItems.map((e) => `${e.name} (${fmtKcal(e.macros.calories)} kcal)`).join(", ")}.
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="t-label font-semibold">{parsed.items.length + extraItems.length} items</span>
            <span>
              <span className="t-num-m text-ivory">{fmtKcal(total + extraItems.reduce((a, e) => a + e.macros.calories, 0))}</span>
              <span className="t-meta ml-1 text-stone">kcal</span>
            </span>
          </div>
          <MealDatePicker meal={meal} onMeal={setMeal} date={date} onDate={setDate} />
          <button type="button" onClick={() => setParsed(null)} className="press t-callout h-11 font-semibold text-ivory underline decoration-ui-line underline-offset-4">
            Paste a different result
          </button>
        </div>
      )}
    </Sheet>
  );
}

function QtyBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="press t-num-m grid size-11 place-items-center rounded-field bg-m3 text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
