"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ISODate } from "@/lib/dates";
import { readinessLine } from "@/lib/recovery/guidance";
import { useReadiness } from "@/lib/recovery/hooks";

/**
 * The Recovery screen's call for the day as one lapis line (it is a suggestion), so the
 * Training start card says exactly what Recovery and Today say for the same check-in.
 * Without a check-in it offers one, unless `checkinPrompt` is off.
 */
export function ReadinessNote({
  date,
  session,
  checkinPrompt = true,
  className,
}: {
  date: ISODate;
  session: string | null;
  checkinPrompt?: boolean;
  className?: string;
}) {
  const { guidance } = useReadiness(date);
  if (!guidance) return null;
  const line = guidance.hasCheckin ? readinessLine(guidance, session) : null;
  if (!line && (guidance.hasCheckin || !checkinPrompt)) return null;
  return (
    <Link
      href={line ? "/recovery" : "/recovery?checkin=1"}
      className={cn(
        "press-soft flex min-h-11 items-center gap-3 rounded-[14px] border border-lapis-line bg-lapis-tint px-3.5 py-2.5 transition-colors hover:border-lapis/60",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-lapis" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] leading-snug">
        {line ? (
          <>
            <span className="font-bold text-lapis-text">Recovery · </span>
            <span className="text-fg">{line}</span>
          </>
        ) : (
          <span className="text-fg-2">
            <span className="font-bold text-lapis-text">Recovery · </span>
            {guidance.partialCheckin ? "Add sleep and soreness for today's call." : "Check in for today's call. It takes 20 seconds."}
          </span>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-fg-3" aria-hidden />
    </Link>
  );
}
