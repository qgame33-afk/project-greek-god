"use client";

import Link from "next/link";
import { Bed, CalendarDays, ChevronRight, GlassWater, ListChecks } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { MealIcon } from "@/components/meals/shared/RecipeGlyph";
import { isAiEntry } from "@/components/nutrition/food/DayList";
import { AiMark } from "@/components/ui/ai-chip";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/controls";
import { NumberInput } from "@/components/ui/field";
import { Empty, ErrorNote } from "@/components/ui/misc";
import { ListGroup, ListItem, Row, SectionAction, SectionHead } from "@/components/ui/list";
import { Sheet } from "@/components/ui/sheet";
import { isOffline } from "@/lib/data/core";
import { useWaterMutations } from "@/lib/data/nutrition";
import type { FoodEntry } from "@/lib/data/nutrition";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import type { Guidance } from "@/lib/recovery/guidance";
import { paceChipLabel } from "@/lib/progress/pace";
import { chronicleDue } from "@/lib/today/now";
import { formatInt, parseNumber, toDisplayWeight } from "@/lib/units";
import { readinessWord } from "./CheckIn";
import { HabitsList } from "./habits";
import { useLocal, writeLocal } from "./local";
import type { NowModel } from "./useNowData";

const LONG_PRESS_MS = 500;
const litres = (ml: number) => (ml / 1000).toFixed(1);
const timeOf = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null);

/** "Recently eaten" (§4.1.1): the last three diary rows of the day, newest first. */
export function RecentlyEaten({ entries, failed, date, today, onRetry }: { entries: FoodEntry[]; failed: boolean; date: ISODate; today: ISODate; onRetry: () => void }) {
  const rows = [...entries].sort((a, b) => (b.eaten_at ?? "").localeCompare(a.eaten_at ?? "")).slice(0, 3);
  const isToday = date === today;
  return (
    <section aria-labelledby="recent-title">
      <SectionHead id="recent-title" action={<SectionAction href={isToday ? "/nutrition" : `/nutrition?date=${date}`}>All food</SectionAction>}>
        {isToday ? "Recently eaten" : `Eaten on ${dayName(date, true)} ${parseISODate(date).getDate()}`}
      </SectionHead>
      {failed && !entries.length ? (
        <ErrorNote onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <Empty title={isToday ? "Nothing yet today" : "Nothing logged that day"}>Tap + to add food</Empty>
      ) : (
        <div className="space-y-2.5">
          {rows.map((e) => {
            const ai = isAiEntry(e);
            const t = timeOf(e.eaten_at);
            return (
              <ListItem
                key={e.id}
                tile={<MealIcon name={e.name} />}
                caption={
                  <span className="inline-flex items-center gap-1.5">
                    {t}
                    {ai && <AiMark />}
                  </span>
                }
                title={<span data-food="">{e.name}</span>}
                dataName
                subtitle={`${formatInt(Math.round(Number(e.calories ?? 0)))} kcal · ${Math.round(Number(e.protein_g ?? 0))} g protein`}
                href={isToday ? "/nutrition" : `/nutrition?date=${date}`}
                chevron={false}
                ariaLabel={`${e.name}, ${t ?? ""}${ai ? ", AI estimate" : ""}, ${Math.round(Number(e.calories ?? 0))} calories, ${Math.round(Number(e.protein_g ?? 0))} grams protein. Opens Food`}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * The quiet group under Recently eaten (§4.1.1): Water with +250 ml (long-press: +500 ml or a
 * custom amount), Habits (the Habits sheet), Check-in (Check-ins, or the sheet when not done), and
 * on days 1–3 of a month last month's recap.
 */
export function TodayRows({ m, guidance, onCheckin }: { m: NowModel; guidance: Guidance | null; onCheckin: () => void }) {
  const water = useWaterMutations(m.today);
  const [habits, setHabits] = useState(false);
  const [waterMore, setWaterMore] = useState(false);
  const [offline, setOffline] = useState(false);
  const timer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const goalMl = Number(m.profile.water_goal_ml ?? 0);
  const day = m.mission;
  const recap = chronicleDue(m.today, m.profile.start_date);
  const opened = useLocal(recap ? `pgg.chronicle.opened.${recap.param}` : "pgg.chronicle.none");
  const word = readinessWord(guidance);

  const add = (ml: number) => {
    if (isOffline()) {
      setOffline(true);
      return;
    }
    setOffline(false);
    const id = water.addMl(ml);
    toast(`Water +${ml} ml`, { duration: 6000, action: { label: "Undo", onClick: () => water.remove.mutate(id) } });
  };
  const endPress = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div className="mt-3">
      <ListGroup>
        <Row
          icon={GlassWater}
          title={
            <>
              Water <span className="whitespace-nowrap font-normal text-fg-2 tabular-nums">{litres(m.waterMl)}{goalMl ? ` of ${litres(goalMl)}` : ""} L</span>
            </>
          }
          ariaLabel={`Water, ${litres(m.waterMl)}${goalMl ? ` of ${litres(goalMl)}` : ""} litres`}
          accessory={
            <span
              onPointerDown={() => {
                longPressed.current = false;
                timer.current = window.setTimeout(() => {
                  longPressed.current = true;
                  setWaterMore(true);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onContextMenu={(e) => e.preventDefault()}
            >
              <Pill
                ariaLabel="Add 250 millilitres of water. Hold for more"
                onClick={() => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    return;
                  }
                  add(250);
                }}
              >
                +250 ml
              </Pill>
            </span>
          }
        />
        <Row icon={ListChecks} title={<>Habits {day && day.total > 0 && <span className="whitespace-nowrap font-normal text-fg-2 tabular-nums">{day.done} of {day.total}</span>}</>} onClick={() => setHabits(true)} ariaLabel={day ? `Habits, ${day.done} of ${day.total} done` : "Habits"} wrap />
        {m.recoveryFailed ? (
          <Row icon={Bed} title="Check-in" value="Couldn't load" href="/recovery" />
        ) : word ? (
          <Row icon={Bed} title={<>Checked in <span className="font-normal text-fg-2">· {word}</span></>} href="/recovery" ariaLabel={`Checked in, ${word}. Opens check-ins`} wrap />
        ) : (
          <Row icon={Bed} title="Not checked in" onClick={onCheckin} ariaLabel="Not checked in. Start the check-in" wrap />
        )}
        {recap && !opened && (
          <Link
            href={`/reviews/${recap.param}`}
            onClick={() => writeLocal(`pgg.chronicle.opened.${recap.param}`, new Date().toISOString())}
            className="press-soft flex min-h-14 w-full items-center gap-3.5 px-4 py-2.5"
          >
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-icon bg-card-3 text-fg">
              <CalendarDays className="size-5" strokeWidth={1.9} />
            </span>
            <span className="t-row min-w-0 flex-1 truncate">{recap.monthName} recap is ready</span>
            <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
          </Link>
        )}
      </ListGroup>
      {offline && (
        <p role="status" className="t-label mt-2">
          You&apos;re offline. Try again when you&apos;re back.
        </p>
      )}

      <Sheet open={habits} onOpenChange={setHabits} title="Habits" description={day && day.total ? `${day.done} of ${day.total} done today` : undefined}>
        <div className="pb-2 pt-2">
          <HabitsList date={m.today} today={m.today} />
          <Button asChild variant="secondary" block className="mt-4">
            <Link href="/recovery#habits">Edit habits</Link>
          </Button>
        </div>
      </Sheet>
      <WaterSheet open={waterMore} onOpenChange={setWaterMore} onAdd={(ml) => add(ml)} />
    </div>
  );
}

/** Long-press on +250 ml: +500 ml or a custom amount. */
function WaterSheet({ open, onOpenChange, onAdd }: { open: boolean; onOpenChange: (o: boolean) => void; onAdd: (ml: number) => void }) {
  const [text, setText] = useState("");
  const ml = parseNumber(text);
  const valid = ml != null && ml >= 10 && ml <= 3000;
  const done = (v: number) => {
    onAdd(Math.round(v));
    setText("");
    onOpenChange(false);
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Add water">
      <div className="grid gap-3 pb-2 pt-2">
        <Button variant="secondary" size="lg" block onClick={() => done(500)}>
          +500 ml
        </Button>
        <label className="t-label mt-2 block font-semibold" htmlFor="water-custom">
          Another amount
        </label>
        <NumberInput id="water-custom" decimal={false} placeholder="330" suffix="ml" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d]/g, "").slice(0, 4))} onKeyDown={(e) => e.key === "Enter" && valid && done(ml!)} />
        <Button variant="primary" size="lg" block disabled={!valid} onClick={() => valid && done(ml!)}>
          {valid ? `Add ${formatInt(ml!)} ml` : "Add"}
        </Button>
      </div>
    </Sheet>
  );
}

/** The weight card (§4.1.1): the 7-day average and the pace chip, → Progress › Weight. */
export function WeightCard({ m, onRetry }: { m: NowModel; onRetry: () => void }) {
  if (m.weightsFailed) return <ErrorNote onRetry={onRetry} />;
  const ready = m.weighInCount >= 4 && m.pace.trend.lb != null;
  const unit = m.unit;
  const avg = ready ? toDisplayWeight(m.pace.trend.lb!, unit).toFixed(1) : null;
  const chip = ready ? paceChipLabel(m.pace.verdict) : null;
  const left = Math.max(1, 4 - m.weighInCount);
  const spoken = ready
    ? `Weight, 7-day average ${avg} ${unit}${chip ? `, ${chip.toLowerCase()}` : ""}. Opens Progress.`
    : `Weight, 7-day average not yet. ${left} more ${left === 1 ? "weigh-in" : "weigh-ins"} to see your average. Opens Progress.`;
  return (
    <Link href="/progress" aria-label={spoken} className="press-soft @container flex flex-wrap items-center gap-3 rounded-card bg-surface px-5 py-4">
      <span className="min-w-0 flex-1 ax:basis-full">
        <span className="t-cap block">Weight · 7-day average</span>
        {avg ? (
          <span className="t-num mt-1 block" data-derived="">
            {avg}
            <span className="unit">{unit}</span>
          </span>
        ) : (
          <>
            <span className="t-num mt-1 block">—</span>
            <span className="t-label mt-0.5 block">
              {left} more {left === 1 ? "weigh-in" : "weigh-ins"} to see your average
            </span>
          </>
        )}
      </span>
      {chip && (
        <span className="t-label inline-flex h-9 shrink-0 items-center rounded-pill bg-control px-3.5 font-semibold text-fg">{chip}</span>
      )}
      <ChevronRight className="size-5 shrink-0 text-fg-3" strokeWidth={1.9} aria-hidden />
    </Link>
  );
}
