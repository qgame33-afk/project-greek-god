"use client";

import Link from "next/link";
import { BellRing, ChevronRight } from "lucide-react";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useToday } from "@/lib/data/core";
import { useProfile } from "@/lib/data/profile";
import { addMonths, dayName, daysBetween, monthEnd, type ISODate } from "@/lib/dates";
import { dayMonth } from "@/lib/progress/pace";
import { sessionsLine, titleCredits } from "@/lib/reviews/chronicle";
import { useSavedReviews } from "@/lib/reviews/hooks";
import type { WeightUnit } from "@/lib/units";
import { Spine, useBooks, type ShelfBook } from "./Shelf";

/**
 * /reviews — the Chronicle's index (docs/DESIGN-V2.md §3.8): every month of the climb as a Book,
 * newest first, as film-title rows ("BOOK I · SEPTEMBER · in which the climb began"). The current
 * month reads "being written". Each opens the story; the full ledger is one tap inside it.
 */
export function ChronicleIndex() {
  const today = useToday();
  const { profile, error, refetch } = useProfile();
  const { books, error: bErr, refetch: bRefetch } = useBooks(profile);
  const saved = useSavedReviews();
  const savedSet = new Set((saved.data ?? []).map((r) => r.month));
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const current = books?.find((b) => b.current) ?? null;
  const total = current ? current.stats.window.monthsTotal : null;

  return (
    <div className="mx-auto max-w-col">
      <header className="relative pb-6 pt-2">
        <p className="t-eyebrow relative text-leaf-300">{current && total ? `Book ${current.numeral} of ${total}` : "The Ascent"}</p>
        <h1 className="t-title-1 relative mt-2 text-ivory">The Chronicle</h1>
        <p className="t-callout relative mt-2 max-w-md text-stone">Each month of the climb, retold from what you logged. A Book is sealed on the 1st; this month&apos;s is being written.</p>
      </header>

      {error && !profile ? (
        <ErrorNote onRetry={() => void refetch()}>Couldn&apos;t load your profile. {(error as Error).message}</ErrorNote>
      ) : bErr ? (
        <ErrorNote onRetry={bRefetch}>Couldn&apos;t open the Chronicle. {bErr.message}</ErrorNote>
      ) : !books ? (
        <div className="divide-y divide-vein border-y border-vein" aria-busy="true" aria-label="Loading the Chronicle">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4 py-4">
              <Skeleton className="h-16 w-12 rounded-tag" />
              <div className="flex-1">
                <Skeleton className="h-3 w-24 rounded-tag" />
                <Skeleton className="mt-2 h-7 w-44 rounded-tag" />
                <Skeleton className="mt-2 h-3 w-56 rounded-tag" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ol className="divide-y divide-vein border-y border-vein">
          {books.map((b) => (
            <BookRow key={b.month} b={b} unit={unit} today={today} saved={savedSet.has(b.month)} />
          ))}
        </ol>
      )}

      {current && (
        <p className="t-meta mt-4 flex items-center gap-2 text-stone">
          <BellRing className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
          <span>
            Book {current.numeral} is sealed {dayName(addMonths(current.month, 1))} {dayMonth(addMonths(current.month, 1), today)}.{" "}
            <Link href="/settings#reminders" className="relative font-semibold text-leaf-300 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-[''] hover:text-leaf-200">
              Remind me
            </Link>
          </span>
        </p>
      )}
    </div>
  );
}

function BookRow({ b, unit, today, saved }: { b: ShelfBook; unit: WeightUnit; today: ISODate; saved: boolean }) {
  const credits = titleCredits(b.stats, unit);
  const ses = sessionsLine(b.stats.training);
  const total = daysBetween(b.month, monthEnd(b.month)) + 1;
  const day = Math.min(total, daysBetween(b.month, today) + 1);
  const line = b.current
    ? `Day ${day} of ${total}${credits[0].value !== "—" ? ` · ${credits[0].value} ${unit} so far` : ""}`
    : [
        credits[0].value !== "—" ? `${credits[0].value} ${unit}` : null,
        ses.value !== "—" ? `${ses.value} ${ses.label}` : null,
        b.stats.training.prs.items.length ? credits[2].value + " " + credits[2].label : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Nothing logged";
  const month = b.film.charAt(0) + b.film.slice(1).toLowerCase();
  return (
    <li>
      <Link
        href={`/reviews/${b.slug}`}
        className="press-soft flex min-h-24 items-center gap-4 py-3.5"
        aria-label={`Book ${b.numeral}, ${month}, ${b.subtitle}. ${line}${saved ? ". Snapshot saved" : ""}. Open`}
      >
        <Spine numeral={b.numeral} state={b.current ? "writing" : "written"} size="lg" />
        <span aria-hidden className="min-w-0 flex-1">
          <span className="t-eyebrow block">
            Book {b.numeral}
            {saved ? " · saved" : ""}
          </span>
          <span className="t-film mt-1 block truncate text-ivory" style={{ fontSize: "1.5rem" }}>
            {b.film}
          </span>
          <span className="t-title-2 mt-0.5 block font-medium italic text-stone">{b.subtitle}</span>
          <span className="t-meta tnum mt-1 block truncate text-stone">{line}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ash" strokeWidth={1.6} aria-hidden />
      </Link>
    </li>
  );
}
