"use client";

import { Droplet, Drumstick, Flame, Utensils, Wheat } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/shell/Avatar";
import { PageHeader } from "@/components/shell/PageHeader";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { Pill } from "@/components/ui/controls";
import { DayStrip, type StripDay } from "@/components/ui/day-strip";
import { DetailsSheet } from "@/components/ui/details-sheet";
import { HeroNumberCard } from "@/components/ui/hero-card";
import { ErrorNote } from "@/components/ui/misc";
import { StatCard, StatRow } from "@/components/ui/stat-card";
import { UpNextCard } from "@/components/ui/up-next";
import { useFoodEntries } from "@/lib/data/nutrition";
import { dayName, parseISODate, type ISODate } from "@/lib/dates";
import type { Macros } from "@/lib/nutrition";
import { formatInt } from "@/lib/units";
import { RecentlyEaten, TodayRows, WeightCard } from "./Below";
import { CheckInSheet } from "./CheckIn";
import { NowSkeleton } from "./NowSkeleton";
import { useDayInput } from "./useDayInput";
import { useNowData, type NowData, type NowModel } from "./useNowData";
import { UpNext, WorkoutDoneCard } from "./UpNext";
import { useRefreshRestored } from "./useRefreshRestored";

/**
 * Today (docs/DESIGN-V3-SIMPLE.md §4.1): one layout all day — the week strip, the calories-to-go
 * hero, the protein / carbs / fat trio, Up next and the weight card — with Recently eaten and the
 * Water / Habits / Check-in rows below the fold. The hero and every trio card open the same
 * "Today in numbers" sheet. A past day in the strip shows that day's numbers ("Calories eaten").
 */
export function TodayScreen() {
  const data = useNowData();
  // the skeleton covers the first load only; a failed background refetch never blanks the page
  const [ready, setReady] = useState(false);
  if (!ready && data.model && !data.loading) setReady(true);

  if (!data.model) {
    if (data.profileError)
      return (
        <div className="pt-4">
          <PageHeader title="Today" />
          <ErrorNote onRetry={() => void data.refetch.all()} />
        </div>
      );
    return <NowSkeleton />;
  }
  if (!ready) return <NowSkeleton />;
  return <TodayContent data={data} m={data.model} />;
}

function TodayContent({ data, m }: { data: NowData; m: NowModel }) {
  const { state, now, sealDate } = useDayInput(m);
  useRefreshRestored();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // /?dawn=1 (and /recovery?checkin=1) opens the check-in sheet
  const wantDawn = params.get("dawn") === "1";
  const [checkin, setCheckin] = useState(wantDawn);
  const [seenWant, setSeenWant] = useState(wantDawn);
  if (wantDawn !== seenWant) {
    setSeenWant(wantDawn);
    if (wantDawn) setCheckin(true);
  }
  useEffect(() => {
    if (wantDawn) router.replace(pathname, { scroll: false });
  }, [wantDawn, pathname, router]);

  const [weigh, setWeigh] = useState(false);
  const [details, setDetails] = useState(false);
  const [picked, setPicked] = useState<ISODate | null>(null);
  // a pick from before midnight never sticks to a new day
  const selected = picked && picked < m.today ? picked : m.today;
  const isToday = selected === m.today;

  const pastFood = useFoodEntries(isToday ? m.today : selected);
  const totals: Macros = isToday ? m.food : pastFood.totals;
  const entries = isToday ? m.foodEntries : pastFood.entries;
  const foodFailed = isToday ? m.foodFailed : !!pastFood.error && !pastFood.hasData;

  const p = m.profile;
  const goals = { kcal: Number(p.calorie_goal) || 0, protein: Number(p.protein_goal) || 0, carbs: Number(p.carb_goal) || 0, fat: Number(p.fat_goal) || 0 };

  // the strip: this Monday–Sunday; a protein-goal day is a win (gold ring and dot), a logged day a ring
  const days: StripDay[] = useMemo(
    () =>
      m.week.map((d) => {
        if (d > m.today) return { date: d };
        const md = m.missionDays.find((x) => x.date === d);
        if (!md || !md.foodLogged) return { date: d, spoken: d < m.today ? "nothing logged" : undefined };
        const win = goals.protein > 0 && md.protein >= goals.protein;
        return { date: d, state: win ? "win" : "logged" };
      }),
    [m.week, m.today, m.missionDays, goals.protein],
  );

  const kcal = Math.round(totals.calories);
  const kcalLeft = goals.kcal - kcal;
  const label = isToday ? (kcalLeft < 0 ? "Calories over" : "Calories to go") : "Calories eaten";
  const heroValue = isToday ? (kcalLeft < 0 ? `+${formatInt(-kcalLeft)}` : formatInt(kcalLeft)) : formatInt(kcal);
  const heroSpoken = isToday ? (kcalLeft < 0 ? `${formatInt(-kcalLeft)} calories over` : `${formatInt(kcalLeft)} calories to go`) : `${formatInt(kcal)} calories eaten on ${dayName(selected)}`;
  const pct = (eaten: number, goal: number) => (goal > 0 ? eaten / goal : 0);

  const macro = (eaten: number, goal: number, name: string) => {
    const left = Math.round(goal - eaten);
    if (!isToday) return { value: String(Math.round(eaten)), label: `${name} eaten`, spoken: `${Math.round(eaten)} grams of ${name.toLowerCase()} eaten` };
    if (left < 0) return { value: `+${-left}`, label: `${name} over`, spoken: `${-left} grams of ${name.toLowerCase()} over` };
    return { value: String(left), label: `${name} to go`, spoken: `${left} grams of ${name.toLowerCase()} to go` };
  };
  const proteinHit = goals.protein > 0 && totals.protein >= goals.protein;
  const protein = proteinHit ? { value: String(Math.round(totals.protein)), label: "Protein done", spoken: `Protein goal done, ${Math.round(totals.protein)} grams` } : macro(totals.protein, goals.protein, "Protein");
  const carbs = macro(totals.carbs, goals.carbs, "Carbs");
  const fat = macro(totals.fat, goals.fat, "Fat");

  const openDetails = () => setDetails(true);
  const plannedLeft = m.meals.filter((x) => !x.eaten);

  return (
    <div className="pb-2">
      <PageHeader
        title="Today"
        accessory={
          isToday ? (
            <Avatar />
          ) : (
            <Pill onClick={() => setPicked(null)} ariaLabel="Back to today">
              Today
            </Pill>
          )
        }
      />
      <DayStrip
        className="mb-4"
        days={days}
        selected={selected}
        today={m.today}
        futureInert
        onSelect={(d) => setPicked(d === m.today ? null : d)}
      />

      {foodFailed && !entries.length ? (
        <ErrorNote onRetry={isToday ? data.refetch.food : () => void pastFood.refetch()} />
      ) : (
        <>
          <HeroNumberCard
            value={heroValue}
            label={label}
            ring={{ pct: pct(kcal, goals.kcal), icon: Flame, goal: goals.kcal > 0 && kcal >= goals.kcal }}
            onDetails={openDetails}
            ariaLabel={heroSpoken}
            hint={isToday ? "Shows today's numbers and how they are worked out." : "Shows that day's numbers and how they are worked out."}
          />
          <StatRow className="mt-3">
            <StatCard value={protein.value} unit="g" label={protein.label} ring={{ pct: pct(totals.protein, goals.protein), icon: Drumstick, goal: proteinHit }} onDetails={openDetails} ariaLabel={protein.spoken} />
            <StatCard value={carbs.value} unit="g" label={carbs.label} ring={{ pct: pct(totals.carbs, goals.carbs), icon: Wheat }} onDetails={openDetails} ariaLabel={carbs.spoken} />
            <StatCard value={fat.value} unit="g" label={fat.label} ring={{ pct: pct(totals.fat, goals.fat), icon: Droplet }} onDetails={openDetails} ariaLabel={fat.spoken} />
          </StatRow>
        </>
      )}

      <div className="mt-3 space-y-3">
        {isToday ? (
          state && <UpNext m={m} state={state} now={now} sealDate={sealDate} onCheckin={() => setCheckin(true)} onWeigh={() => setWeigh(true)} />
        ) : (
          <UpNextCard
            caption={dayName(selected)}
            icon={Utensils}
            title={`Food for ${dayName(selected, true)} ${parseISODate(selected).getDate()}`}
            subtitle={entries.length ? `${entries.length} ${entries.length === 1 ? "food" : "foods"} logged` : "Nothing logged"}
            onBody={() => router.push(`/nutrition?date=${selected}`)}
            bodyLabel={`Food for ${dayName(selected)}. Opens Food`}
          />
        )}
        {isToday && <WorkoutDoneCard m={m} />}
        <WeightCard m={m} onRetry={data.refetch.weights} />
      </div>

      <RecentlyEaten entries={entries} failed={foodFailed} date={selected} today={m.today} onRetry={isToday ? data.refetch.food : () => void pastFood.refetch()} />
      {isToday && <TodayRows m={m} guidance={data.readiness.guidance} onCheckin={() => setCheckin(true)} />}

      <DetailsSheet
        open={details}
        onOpenChange={setDetails}
        title={isToday ? "Today in numbers" : `${dayName(selected)} in numbers`}
        rows={[
          { label: "Calories", value: formatInt(kcal), detail: line(kcal, goals.kcal, "kcal", "") },
          { label: "Protein", value: `${Math.round(totals.protein)} g`, detail: line(totals.protein, goals.protein, "g", " g") },
          { label: "Carbs", value: `${Math.round(totals.carbs)} g`, detail: line(totals.carbs, goals.carbs, "g", " g") },
          { label: "Fat", value: `${Math.round(totals.fat)} g`, detail: line(totals.fat, goals.fat, "g", " g") },
          ...(isToday ? [{ label: "Water", value: `${(m.waterMl / 1000).toFixed(1)} L`, detail: waterLine(m.waterMl, Number(p.water_goal_ml) || 0) }] : []),
        ]}
        note={
          isToday && plannedLeft.length > 0 ? (
            <>
              If you eat what is planned
              <span className="t-label mt-1 block">
                {formatInt(Math.round(kcal + plannedLeft.reduce((a, x) => a + x.kcal, 0)))} kcal and {Math.round(totals.protein + plannedLeft.reduce((a, x) => a + x.protein, 0))} g protein by tonight
              </span>
            </>
          ) : undefined
        }
        how={howLine(isToday, entries.length, plannedLeft.length)}
      />
      <CheckInSheet open={checkin} onOpenChange={setCheckin} date={m.today} />
      <WeightLogSheet open={weigh} onOpenChange={setWeigh} />
    </div>
  );
}

/** "1,413 to go of 3,300 kcal", "120 over 3,300 kcal", "No goal set". */
function line(eaten: number, goal: number, unit: string, numUnit: string) {
  if (!(goal > 0)) return "No goal set · Settings › Goals";
  const left = Math.round(goal - eaten);
  return left >= 0 ? `${formatInt(left)}${numUnit} to go of ${formatInt(goal)} ${unit}` : `${formatInt(-left)}${numUnit} over ${formatInt(goal)} ${unit}`;
}

function waterLine(ml: number, goal: number) {
  if (!(goal > 0)) return "No goal set · Settings › Goals";
  const left = Math.max(0, goal - ml);
  return left > 0 ? `${(left / 1000).toFixed(1)} L to go of ${(goal / 1000).toFixed(1)} L` : `Goal of ${(goal / 1000).toFixed(1)} L reached`;
}

function howLine(isToday: boolean, foods: number, planned: number) {
  const eaten = foods === 0 ? "Nothing is logged yet, so eaten is 0." : `Eaten adds up the ${foods} ${foods === 1 ? "food" : "foods"} you logged${isToday ? " today" : " that day"}.`;
  const plan = isToday ? (planned > 0 ? ` Planned adds the ${planned} ${planned === 1 ? "meal" : "meals"} left in today's plan.` : " Nothing is left in today's plan.") : "";
  return `Goals come from Settings › Goals. ${eaten}${plan}`;
}
