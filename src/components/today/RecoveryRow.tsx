"use client";

import Link from "next/link";
import { ChevronRight, HeartPulse } from "lucide-react";
import { cn } from "@/lib/cn";
import { relativeDay } from "@/lib/dates";
import { fmtHours } from "@/lib/today/daily-line";
import type { TodayModel } from "./useTodayModel";

/** Recovery link row: today's check-in in one line, or the prompt to log one. */
export function RecoveryRow({ m, className }: { m: TodayModel; className?: string }) {
  const r = m.todayRec;
  const parts: string[] = [];
  if (r?.sleep_hours != null) parts.push(`Sleep ${fmtHours(Number(r.sleep_hours))} h`);
  if (r?.energy != null) parts.push(`Energy ${r.energy}/5`);
  if (r?.soreness != null) parts.push(`Soreness ${r.soreness}/5`);
  const last = !r && m.lastRec ? m.lastRec : null;

  return (
    <Link
      href={r ? "/recovery" : "/recovery?checkin=1"}
      className={cn("card press-soft group flex min-h-[72px] items-center gap-3.5 p-4 transition-colors hover:border-line-strong sm:px-5", className)}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-lapis-tint text-lapis">
        <HeartPulse className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow block">Recovery · today</span>
        <span className="mt-1 block truncate text-[15px] font-semibold text-fg">{r ? (parts.length ? parts.join(" · ") : "Check-in logged") : "Log a recovery check-in"}</span>
        {last && (
          <span className="mt-0.5 block truncate text-[12.5px] font-medium text-fg-3">
            Last: {relativeDay(last.local_date, m.today)}
            {last.sleep_hours != null ? ` · Sleep ${fmtHours(Number(last.sleep_hours))} h` : ""}
            {last.energy != null ? ` · Energy ${last.energy}/5` : ""}
          </span>
        )}
        {r?.pain_notes?.trim() && <span className="mt-0.5 block truncate text-[12.5px] font-medium text-fg-2">Pain noted: {r.pain_notes.trim()}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}
