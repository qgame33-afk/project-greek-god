"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowRight, Pencil } from "lucide-react";
import { Meander } from "@/components/art/Motifs";
import { LoggedBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useWeights } from "@/lib/data/body";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import { daysBetween, monthName } from "@/lib/dates";
import { formatBodyweight, type WeightUnit } from "@/lib/units";
import { cn } from "@/lib/cn";
import type { Json } from "@/lib/supabase/database.types";
import { defaultMilestone, monthsBetween, parseRoadmap, removeOverride, reviewSlug, roadmapMonths, upsertOverride, type RoadmapEntry } from "@/lib/progress/months";
import { planFromProfile, programmeWeek } from "@/lib/progress/plan";
import { PlanBadge } from "../kit";

export function RoadmapTab() {
  const today = useToday();
  const { profile, loading } = useProfile();
  const { weights } = useWeights();
  const unit = (profile?.weight_unit ?? "lb") as WeightUnit;
  const plan = planFromProfile(profile, today);
  const overrides = useMemo(() => parseRoadmap(profile?.roadmap), [profile?.roadmap]);
  const months = useMemo(
    () => roadmapMonths({ plan, today, overrides, weights, startLabel: formatBodyweight(plan.startLb, unit) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plan.startDate, plan.targetDate, plan.startLb, plan.goalLb, today, overrides, weights, unit],
  );
  const [editing, setEditing] = useState<RoadmapEntry | null>(null);

  const total = Math.max(1, daysBetween(plan.startDate, plan.targetDate));
  const elapsed = Math.min(1, Math.max(0, daysBetween(plan.startDate, today) / total));
  const wk = programmeWeek(plan, today);
  const loggedMonths = months.filter((m) => m.logged != null).length;
  const next = months.find((m) => m.status === "future");

  // Measure the header width for the meander (callback ref: the node mounts after loading).
  const [w, setW] = useState(0);
  const ro = useRef<ResizeObserver | null>(null);
  const head = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect();
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.current.observe(el);
  }, []);

  if (loading) return <Skeleton className="h-[640px] w-full rounded-[28px]" />;

  return (
    <div className="mx-auto grid w-full max-w-[820px] grid-cols-1 gap-4">
      <Card variant="monument" className="overflow-hidden">
        <div ref={head}>
          <p className="eyebrow !text-gold-300">
            <span className="num text-[13px] tracking-[0.12em]">
              {monthName(plan.startDate, true)} {plan.startDate.slice(0, 4)} → {monthName(plan.targetDate, true)} {plan.targetDate.slice(0, 4)}
            </span>
          </p>
          <h2 className="t-hero mt-2">The roadmap</h2>
          <p className="mt-3 text-[13px] text-fg-2">
            <span className="num text-[15px] text-fg">{formatBodyweight(plan.startLb, unit)}</span> to <span className="num text-[15px] text-fg">{formatBodyweight(plan.goalLb, unit)}</span> · week{" "}
            <span className="num text-[15px] text-fg">{wk.week}</span> of {wk.total} · <span className="num text-[15px] text-gold-300">{Math.round(elapsed * 100)}%</span> of the timeline
          </p>
          {w > 0 && (
            // ≥1024px the sidebar already carries the screen's one meander (DESIGN §1.8).
            <div className="mt-4 lg:hidden" aria-hidden>
              <Meander width={w} height={12} progress={elapsed} />
            </div>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="card-inset px-3 py-2.5">
              <p className="eyebrow">Months logged</p>
              <p className="num-sm mt-1">
                {loggedMonths}
                <span className="unit [font-size:max(12px,0.4em)]!">of {months.length}</span>
              </p>
            </div>
            <div className="card-inset px-3 py-2.5">
              <p className="eyebrow">Next milestone</p>
              <p className="mt-1 line-clamp-2 text-[14px] font-bold leading-snug text-fg">{next ? `${monthName(next.month, true)} · ${next.title || "Open"}` : "Final month"}</p>
            </div>
          </div>
        </div>

        <ol className="mt-6" aria-label="Monthly roadmap">
          {months.map((m, i) => (
            <MonthRow key={m.month} m={m} last={i === months.length - 1} unit={unit} onEdit={() => setEditing(m)} />
          ))}
        </ol>

        <p className="mt-2 text-[12px] leading-relaxed text-fg-3">
          PLAN is an illustrative straight line from {formatBodyweight(plan.startLb, unit)} to {formatBodyweight(plan.goalLb, unit)}, not a prediction. The plan never switches to cutting on its own; any change of phase is your call.
        </p>
      </Card>

      <MilestoneSheet entry={editing} total={months.length} onClose={() => setEditing(null)} />
    </div>
  );
}

function MonthRow({ m, last, unit, onEdit }: { m: RoadmapEntry; last: boolean; unit: WeightUnit; onEdit: () => void }) {
  const today = useToday();
  const year = m.month.slice(0, 4);
  const current = m.status === "current";
  const past = m.status === "past";
  const showYear = m.month.slice(5, 7) === "01" || m.offset === 0 || last;
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 pb-6" aria-current={current ? "step" : undefined}>
      {/* rail */}
      {!last && (
        <span className="absolute bottom-0 left-[13px] top-[24px] w-[2px] overflow-hidden rounded-full" aria-hidden>
          <span className="absolute inset-0 [background:repeating-linear-gradient(to_bottom,var(--line-strong)_0_4px,transparent_4px_9px)]" />
          <span className="absolute inset-x-0 top-0 bg-[linear-gradient(180deg,#D5AC67,#A97E40)]" style={{ height: `${m.railFill * 100}%` }} />
        </span>
      )}
      {/* node */}
      <span className="relative mt-[5px] grid size-[28px] place-items-start justify-center" aria-hidden>
        {current ? (
          <span className="grid size-[18px] place-items-center rounded-full border-2 border-gold-400 bg-s1">
            <span className="size-[6px] rounded-full bg-gold-300" />
          </span>
        ) : past ? (
          <span className="mt-[3px] size-[12px] rounded-full bg-[image:var(--grad-leaf)]" />
        ) : (
          <span className="mt-[3px] size-[12px] rounded-full border-[1.5px] border-line-strong bg-s1" />
        )}
      </span>

      <div className={cn("min-w-0", current && "card-inset -mt-1 rounded-[16px] border border-line-gold bg-gold-tint/40 p-3.5")}>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className={cn("t-plaque", m.status === "future" && "!text-fg-2")}>
            {monthName(m.month)}
            {showYear && <span className="num ml-2 text-[12px] tracking-normal text-fg-3">{year}</span>}
          </h3>
          <span className="-my-2 -mr-2 flex shrink-0 items-center">
            {current && <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-gold-300">Now</span>}
            <button type="button" onClick={onEdit} className="grid size-11 place-items-center rounded-[12px] text-fg-3 hover:text-fg" aria-label={`Edit ${monthName(m.month)} milestone`}>
              <Pencil className="size-4" />
            </button>
          </span>
        </div>
        <p className={cn("mt-1.5 text-[15px] font-bold", m.title ? "text-fg" : "text-fg-3")}>{m.title || "No milestone yet"}</p>
        {m.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-2">{m.detail}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <PlanBadge>
            Plan <span className="num ml-1 text-[12px] tracking-normal">{formatBodyweight(m.plan, unit)}</span>
          </PlanBadge>
          {m.logged != null ? (
            <span className="inline-flex items-center gap-1.5">
              <LoggedBadge />
              <span className="num text-[14px] font-semibold text-fg">
                {formatBodyweight(m.logged, unit)} <span className="font-sans text-[11px] font-medium text-fg-3">avg · {m.loggedCount} weigh-in{m.loggedCount === 1 ? "" : "s"}</span>
              </span>
            </span>
          ) : m.status !== "future" ? (
            <span className="text-[12px] font-medium text-fg-3">No weigh-ins this month</span>
          ) : null}
          {m.custom && <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-fg-3">Edited</span>}
        </div>

        {m.status !== "future" && (
          <div className="-ml-2 mt-1 flex flex-wrap items-center">
            <Link href={`/reviews/${reviewSlug(m.month)}`} className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200">
              Monthly review <ArrowRight className="size-3.5" />
            </Link>
            {current && <span className="px-2 text-[12px] text-fg-3">Day {daysBetween(m.month, today) + 1} of the month</span>}
          </div>
        )}
      </div>
    </li>
  );
}

function MilestoneSheet({ entry, total, onClose }: { entry: RoadmapEntry | null; total: number; onClose: () => void }) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  // Keep the last entry while the sheet animates closed; start from the saved text on every open.
  const [shown, setShown] = useState<RoadmapEntry | null>(entry);
  const [openFor, setOpenFor] = useState<string | null>(null);
  if (entry && openFor !== entry.month) {
    setOpenFor(entry.month);
    setShown(entry);
    setTitle(entry.title);
    setDetail(entry.detail);
  } else if (!entry && openFor) setOpenFor(null);
  const e = entry ?? shown;
  if (!e) return null;
  const def = defaultMilestone(e.offset, total);
  const list = parseRoadmap(profile?.roadmap);

  const commit = (next: ReturnType<typeof parseRoadmap>) => {
    if (save.isPending) return;
    save.mutate({ values: { roadmap: next as unknown as NonNullable<Json> } }, { onSuccess: () => onClose() });
  };
  const saveText = () => {
    const t = title.trim().slice(0, 80);
    const d = detail.trim().slice(0, 400);
    // Text identical to the built-in milestone isn't a customisation.
    if (!e.custom && t === e.title && d === e.detail) return onClose();
    if (def && t === def.title && d === def.detail) return commit(removeOverride(list, e.offset));
    commit(upsertOverride(list, { offset: e.offset, title: t, detail: d }));
  };

  return (
    <Sheet
      open={!!entry}
      onOpenChange={(o) => !o && onClose()}
      title={`${monthName(e.month)} ${e.month.slice(0, 4)}`}
      description="Your milestone for this month."
      footer={
        <Button
          variant="primary"
          size="lg"
          block
          loading={save.isPending}
          disabled={!title.trim() && !detail.trim()}
          onClick={saveText}
        >
          Save milestone
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 py-2">
        <Field label="Title">{(id) => <Input id={id} value={title} maxLength={80} onChange={(ev) => setTitle(ev.target.value)} placeholder="e.g. First progress review" autoComplete="off" />}</Field>
        <Field label="Detail" hint={`${detail.length}/400`}>
          {(id) => <Textarea id={id} rows={3} maxLength={400} value={detail} onChange={(ev) => setDetail(ev.target.value)} placeholder="What this month is for" />}
        </Field>
        {def && (
          <div className="card-inset p-3.5">
            <p className="eyebrow mb-1">Original plan</p>
            <p className="text-[14px] font-semibold text-fg">{def.title}</p>
            <p className="text-[13px] text-fg-2">{def.detail}</p>
          </div>
        )}
        {e.custom && (
          <Button variant="ghost" className="h-11 justify-self-center" onClick={() => commit(removeOverride(list, e.offset))} disabled={save.isPending}>
            Reset to original
          </Button>
        )}
        <p className="text-[12px] text-fg-3">Months run {monthsBetween(profile?.start_date ?? e.month, profile?.target_date ?? e.month).length} in total, from your start date to your target date (Settings).</p>
      </div>
    </Sheet>
  );
}
