// Seven-day intake strip from real daily totals. Days without entries stay empty.

import { caloriesHit, proteinHit } from "@/lib/nutrition";
import { addDays, dayName, type ISODate } from "@/lib/dates";

export interface DayTotalsRow {
  local_date: string | null;
  calories: number | null;
  protein_g: number | null;
  entries?: number | null;
}

export interface WeekDay {
  date: ISODate;
  letter: string;
  logged: boolean;
  kcal: number | null;
  protein: number | null;
  /** kcal ÷ target, 0 when not logged. */
  pct: number;
  calorieHit: boolean;
  proteinHit: boolean;
  isToday: boolean;
}

export interface WeekSummary {
  days: WeekDay[];
  loggedDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  proteinHits: number;
  calorieHits: number;
}

export function buildWeek(rows: DayTotalsRow[], end: ISODate, today: ISODate, goals: { calories: number; protein: number }): WeekSummary {
  const byDate = new Map<string, DayTotalsRow>();
  for (const r of rows) if (r.local_date) byDate.set(r.local_date, r);
  const days: WeekDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(end, -i);
    const r = byDate.get(date);
    const logged = !!r && ((r.entries ?? 1) > 0 || Number(r.calories) > 0);
    const kcal = logged ? Number(r!.calories ?? 0) : null;
    const protein = logged ? Number(r!.protein_g ?? 0) : null;
    days.push({
      date,
      letter: dayName(date, true).slice(0, 1),
      logged,
      kcal,
      protein,
      pct: logged && goals.calories > 0 ? (kcal ?? 0) / goals.calories : 0,
      calorieHit: logged && caloriesHit(kcal ?? 0, goals.calories),
      proteinHit: logged && proteinHit(protein ?? 0, goals.protein),
      isToday: date === today,
    });
  }
  const logged = days.filter((d) => d.logged);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    days,
    loggedDays: logged.length,
    avgKcal: avg(logged.map((d) => d.kcal ?? 0)),
    avgProtein: avg(logged.map((d) => d.protein ?? 0)),
    proteinHits: days.filter((d) => d.proteinHit).length,
    calorieHits: days.filter((d) => d.calorieHit).length,
  };
}
