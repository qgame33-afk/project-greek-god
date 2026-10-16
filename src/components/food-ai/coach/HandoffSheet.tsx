"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ClipboardPaste, Copy, ExternalLink } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Field, Input, Textarea } from "@/components/ui/field";
import { EstimateBadge, SourceBadge } from "@/components/ui/badge";
import { ErrorNote } from "@/components/ui/misc";
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
      <ClipboardPaste className="size-[18px]" />
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
          <ol className="space-y-1.5 text-[13px] leading-relaxed text-fg-2">
            <li>
              <span className="num mr-1.5 text-gold-300">1</span>Open an assistant with the request below.
            </li>
            <li>
              <span className="num mr-1.5 text-gold-300">2</span>Copy its whole reply, including the <code className="text-fg">```json</code> block.
            </li>
            <li>
              <span className="num mr-1.5 text-gold-300">3</span>Paste it here and review before anything is logged.
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
                  className="min-h-[88px]"
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
              <ExternalLink className="size-4 text-fg-3" />
            </Button>
            <Button variant="secondary" onClick={() => openAssistant("claude")}>
              Research in Claude
              <ExternalLink className="size-4 text-fg-3" />
            </Button>
          </div>

          <div className="rounded-[14px] bg-s3">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-expanded={showPrompt}
                onClick={() => setShowPrompt((v) => !v)}
                className="flex h-11 flex-1 items-center gap-1.5 px-3.5 text-left text-[13px] font-semibold text-fg-2 hover:text-fg"
              >
                <ChevronDown className={cn("size-4 transition-transform", showPrompt && "rotate-180")} />
                {showPrompt ? "Hide the request" : "Show the request"}
              </button>
              <button type="button" onClick={() => void copy()} className="inline-flex h-11 items-center gap-1.5 px-3.5 text-[13px] font-bold text-gold-300">
                <Copy className="size-4" />
                Copy prompt
              </button>
            </div>
            {showPrompt && (
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-line-hair px-3.5 py-3 text-[12px] leading-relaxed text-fg-2">
                {prompt}
              </pre>
            )}
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
                className="min-h-28 font-mono text-[13px]"
              />
            )}
          </Field>
          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] text-fg-2">Answer came from</p>
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
          <p className="rounded-[12px] bg-s3 px-3.5 py-2.5 text-[12px] leading-relaxed text-fg-2">
            Reported by {ASSISTANT_LABEL[assistant]}. We didn&apos;t open these pages ourselves, so tap a link to check it before you trust it.
            {parsed.skipped > 0 && ` ${parsed.skipped} item${parsed.skipped > 1 ? "s" : ""} without usable numbers were left out.`}
          </p>
          <ul className="space-y-2.5">
            {parsed.items.map((i) => (
              <li key={i.key} className="card-instrument p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-bold text-fg">{i.name}</p>
                    <p className="text-[12px] text-fg-3">
                      {fmtKcal(i.perUnit.calories)} kcal per {i.unit}
                      {i.sourceName && i.sourceUrl ? ` · ${i.sourceName}` : ""}
                      {i.notes ? ` · ${i.notes}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-right leading-none">
                    <span className="num-sm">{fmtKcal(i.total.calories)}</span>
                    <span className="unit !text-[12px]">kcal</span>
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
                <div className="mt-3 flex items-center gap-2 border-t border-line-hair pt-3">
                  <span className="text-[13px] font-semibold text-fg-2">Quantity</span>
                  <div className="ml-auto flex items-center gap-2">
                    <QtyBtn label={`Fewer ${i.name}`} onClick={() => setQty(i.key, i.quantity - 1)} disabled={i.quantity <= 1}>
                      −
                    </QtyBtn>
                    <span className="num min-w-[4ch] text-center text-[18px]">
                      {i.quantity} <span className="text-[12px] text-fg-3">{unitLabel(i.quantity, i.unit)}</span>
                    </span>
                    <QtyBtn label={`More ${i.name}`} onClick={() => setQty(i.key, i.quantity + 1)}>
                      +
                    </QtyBtn>
                  </div>
                  <button type="button" onClick={() => removeItem(i.key)} className="h-11 px-2 text-[13px] font-bold text-fg-3 hover:text-fg">
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {extraItems.length > 0 && (
            <p className="text-[12px] leading-relaxed text-fg-3">
              Also logged from the draft: {extraItems.map((e) => `${e.name} (${fmtKcal(e.macros.calories)} kcal)`).join(", ")}.
            </p>
          )}
          <div className="flex items-baseline justify-between">
            <span className="eyebrow">{parsed.items.length + extraItems.length} items</span>
            <span>
              <span className="num-md">{fmtKcal(total + extraItems.reduce((a, e) => a + e.macros.calories, 0))}</span>
              <span className="unit !text-[12px]">kcal</span>
            </span>
          </div>
          <MealDatePicker meal={meal} onMeal={setMeal} date={date} onDate={setDate} />
          <button type="button" onClick={() => setParsed(null)} className="h-11 text-[13px] font-bold text-gold-300">
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
      className={cn("press grid size-11 place-items-center rounded-[12px] bg-s3 text-[20px] font-semibold text-fg-2 hover:text-fg disabled:opacity-30")}
    >
      {children}
    </button>
  );
}
