"use client";

import { useMemo } from "react";
import { useToday } from "@/lib/data/core";
import type { Profile } from "@/lib/data/profile";
import { monthStart, type ISODate } from "@/lib/dates";
import { computeReview, reviewMonths, type ReviewStats } from "@/lib/reviews/compute";
import { useReviewSource } from "@/lib/reviews/hooks";

export interface Recap {
  month: ISODate;
  /** "2026-09", the route segment. */
  slug: string;
  current: boolean;
  stats: ReviewStats;
}

/** Every month of the programme so far (start month → this one), newest first, from lib/reviews. */
export function useRecaps(profile: Profile | null | undefined) {
  const today = useToday();
  const start = profile ? (profile.start_date > today ? today : profile.start_date) : today;
  const src = useReviewSource(monthStart(start), today, { withSets: false });
  const recaps = useMemo<Recap[] | null>(() => {
    if (!profile || !src.rows || !src.reviewProfile) return null;
    const cur = monthStart(today);
    return reviewMonths(start, today)
      .map((m) => ({ month: m, slug: m.slice(0, 7), current: m === cur, stats: computeReview({ month: m, today, profile: src.reviewProfile!, rows: src.rows! }) }))
      .reverse();
  }, [profile, src.rows, src.reviewProfile, start, today]);
  return { recaps, error: src.error, refetch: src.refetch };
}
