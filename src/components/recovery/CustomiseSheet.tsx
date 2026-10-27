"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash,
} from "lucide-react";
import { AutoBadge, OptionalBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip, Segmented, Stepper } from "@/components/ui/controls";
import { Field, Input, NumberInput } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import {
  useHabitDefMutations,
  useHabitDefs,
  type HabitDef,
} from "@/lib/data/recovery";
import { useUser } from "@/lib/data/core";
import {
  editability,
  formatTarget,
  HABIT_PRESETS,
  habitDisplayLabel,
  habitKeyFor,
  isOptionalHabit,
  moveVisible,
  nextSort,
  presetState,
  validateDraft,
  type DraftErrors,
  type HabitDraft,
  type HabitKind,
  type HabitPreset,
} from "@/lib/recovery/habits-edit";
import { useHabitDefsCache } from "@/lib/recovery/hooks";
import { formatInt } from "@/lib/units";

const AUTO_LABELS: Record<string, string> = {
  workout: "Training or recovery done",
  protein: "Protein goal",
  calories: "Calorie goal",
  water: "Hydration goal",
  weighin: "Log bodyweight",
  sleep: "Sleep goal",
};

const AUTO_SOURCE: Record<string, string> = {
  workout: "From finished sessions and check-ins",
  protein: "From your food log",
  calories: "From your food log",
  water: "From water taps",
  weighin: "From weigh-ins",
  sleep: "From your check-in",
};

type Upsertable = Pick<
  HabitDef,
  "key" | "label" | "kind" | "target" | "unit" | "active" | "sort"
> & { created_at?: string };
const toUpsert = (d: Upsertable) => ({
  key: d.key,
  label: d.label,
  kind: d.kind,
  target: d.target,
  unit: d.unit,
  active: d.active,
  sort: d.sort,
  // Restoring a deleted habit keeps the day it was first added.
  ...(d.created_at && !d.created_at.startsWith("optimistic")
    ? { created_at: d.created_at }
    : {}),
});

export function CustomiseSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Choose habits"
      description="Show, hide, reorder or add your own."
      wide
    >
      {open && <CustomiseBody />}
    </Sheet>
  );
}

interface Notice {
  id: number;
  text: string;
  undo?: () => void;
}

/**
 * Feedback inside the sheet. A toast's Undo can't be tapped while a modal sheet is open
 * (the sheet treats the tap as "outside" and closes), so the sheet carries its own.
 */
function useNotice() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const show = (text: string, undo?: () => void) => {
    if (timer.current) window.clearTimeout(timer.current);
    const n = { id: Date.now(), text, undo };
    setNotice(n);
    timer.current = window.setTimeout(
      () => setNotice((cur) => (cur?.id === n.id ? null : cur)),
      undo ? 6000 : 3500,
    );
  };
  const clear = () => setNotice(null);
  return { notice, show, clear };
}

function CustomiseBody() {
  const defs = useHabitDefs();
  const { upsert, remove } = useHabitDefMutations();
  const patch = useHabitDefsCache();
  const { userId } = useUser();
  const [editing, setEditing] = useState<string | null>(null);
  const [reorder, setReorder] = useState(false);
  const { notice, show, clear } = useNotice();
  const list = [...(defs.data ?? [])].sort((a, b) => a.sort - b.sort);

  /** Optimistic upsert of one or more rows with rollback on failure. */
  const write = (rows: Upsertable[], after?: (saved: HabitDef[]) => void) => {
    const keys = new Set(rows.map((r) => r.key));
    const rollback = patch((cur) => {
      const kept = cur.filter((d) => !keys.has(d.key));
      const next = rows.map(
        (r) =>
          ({
            ...(cur.find((d) => d.key === r.key) ?? {
              id: `optimistic-${r.key}`,
              user_id: userId ?? "",
              created_at: new Date().toISOString(),
            }),
            ...r,
          }) as HabitDef,
      );
      return [...kept, ...next];
    });
    let failed = false;
    const saved: HabitDef[] = [];
    for (const r of rows)
      upsert.mutate(toUpsert(r), {
        onError: () => {
          if (!failed) rollback();
          failed = true;
        },
        onSuccess: (row) => {
          saved.push(
            (row ?? {
              ...r,
              id: "",
              user_id: userId ?? "",
              created_at: "",
            }) as HabitDef,
          );
          if (saved.length === rows.length && !failed) after?.(saved);
        },
      });
  };

  const move = (key: string, dir: -1 | 1) => {
    const { changed } = moveVisible(
      list.map((d) => ({ ...d, kind: d.kind as HabitKind })),
      key,
      dir,
    );
    if (changed.length) write(changed);
  };

  const setActive = (d: HabitDef, active: boolean, quiet = false) =>
    write([{ ...d, active }], () => {
      if (quiet) return;
      const name = displayName(d);
      show(
        active ? `“${name}” is back on your list` : `“${name}” hidden`,
        () => write([{ ...d, active: !active }]),
      );
    });

  /** Delete a custom habit. `quiet` skips the Undo notice (used when undoing an add). */
  const del = (d: HabitDef, quiet = false) => {
    const rollback = patch((cur) => cur.filter((x) => x.key !== d.key));
    remove.mutate(d.id, {
      onError: rollback,
      onSuccess: () => {
        if (quiet) return;
        show(`Removed “${d.label}”. Past check marks are kept.`, () =>
          write([d]),
        );
      },
    });
    setEditing(null);
  };

  const addPreset = (p: HabitPreset) => {
    const state = presetState(p, list);
    if (state === "active") return;
    if (state === "hidden") {
      const d = list.find((x) =>
        p.builtIn
          ? x.key === p.builtIn
          : x.label.trim().toLowerCase() === p.label.toLowerCase(),
      )!;
      setActive(d, true);
      return;
    }
    const row: Upsertable = {
      key: habitKeyFor(
        p.label,
        list.map((d) => d.key),
      ),
      label: p.label,
      kind: p.kind,
      target: p.target ?? null,
      unit: p.unit ?? null,
      active: true,
      sort: nextSort(list),
    };
    write([row], ([saved]) => addedNotice(saved));
  };

  const addedNotice = (saved: HabitDef) =>
    show(`Added “${saved.label}”`, () => del(saved, true));

  if (defs.isLoading)
    return (
      <div className="space-y-2 py-2" aria-hidden>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );

  const active = list.filter((d) => d.active);
  const hidden = list.filter((d) => !d.active);

  return (
    <div className="pb-2">
      <div className="mt-1 flex items-center justify-between">
        <p className="t-label font-semibold">On your list · {active.length}</p>
        {active.length > 1 && (
          <button
            type="button"
            onClick={() => {
              setReorder((r) => !r);
              setEditing(null);
            }}
            aria-pressed={reorder}
            className="t-label -mr-2 inline-flex h-11 items-center gap-1.5 px-2 font-semibold text-fg"
          >
            {reorder ? (
              "Done"
            ) : (
              <>
                <ArrowUpDown className="size-4" aria-hidden /> Reorder
              </>
            )}
          </button>
        )}
      </div>
      <ul>
        {active.map((d, i) => (
          <HabitRow
            key={d.key}
            d={d}
            reorder={reorder}
            first={i === 0}
            last={i === active.length - 1}
            editing={editing === d.key}
            onEdit={() => setEditing(editing === d.key ? null : d.key)}
            onMove={(dir) => move(d.key, dir)}
            onToggle={() => setActive(d, false)}
            onSave={(v) => {
              write([{ ...d, ...v }], () => show(`Saved “${v.label}”`));
              setEditing(null);
            }}
            onDelete={() => del(d)}
            notify={show}
            otherLabels={list
              .filter((x) => x.key !== d.key)
              .map((x) => x.label)}
          />
        ))}
      </ul>

      {hidden.length > 0 && (
        <>
          <p className="t-label font-semibold mb-1 mt-6">Hidden · {hidden.length}</p>
          <ul>
            {hidden.map((d) => (
              <li
                key={d.key}
                className="flex min-h-14 items-center gap-2 border-b border-line last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-row block truncate text-fg-2">
                    {displayName(d)}
                  </span>
                  <span className="t-label block truncate text-fg-2">
                    Not counted toward your day
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={() => setActive(d, true)}
                  aria-label={`Show ${displayName(d)}`}
                >
                  <Eye className="size-4" /> Show
                </Button>
                {editability({ key: d.key, kind: d.kind as HabitKind })
                  .remove && (
                  <button
                    type="button"
                    onClick={() => del(d)}
                    className="grid size-11 place-items-center rounded-field text-fg-2 hover:text-danger"
                    aria-label={`Delete ${d.label}`}
                  >
                    <Trash className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="t-label font-semibold mb-2 mt-7">Suggestions</p>
      <div className="flex flex-wrap gap-2">
        {HABIT_PRESETS.map((p) => {
          const st = presetState(p, list);
          return (
            <Chip
              key={p.id}
              selected={st === "active"}
              disabled={st === "active"}
              onClick={() => addPreset(p)}
              ariaLabel={
                st === "active"
                  ? `${p.label}, already on your list`
                  : st === "hidden"
                    ? `Show ${p.label} again`
                    : `Add ${p.label}`
              }
            >
              {st === "active" ? (
                <Check className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {p.label}
              {p.target ? (
                <span className="text-fg-2">
                  · {formatTarget(p.target, p.unit ?? null)}
                </span>
              ) : null}
            </Chip>
          );
        })}
      </div>

      <AddHabitForm
        existing={list}
        onAdd={(row) => {
          write([row], ([saved]) => addedNotice(saved));
        }}
      />

      {notice && (
        <div
          role="status"
          className="sticky bottom-3 z-10 mt-4 flex min-h-13 items-center gap-3 rounded-field bg-control py-1 pl-4 pr-1"
        >
          <span className="t-label min-w-0 flex-1 font-semibold text-fg">
            {notice.text}
          </span>
          {notice.undo && (
            <button
              type="button"
              onClick={() => {
                notice.undo?.();
                clear();
              }}
              className="t-label h-11 shrink-0 rounded-field px-3 font-semibold text-fg"
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const displayName = (d: Pick<HabitDef, "key" | "kind" | "label">) =>
  d.kind === "auto"
    ? (AUTO_LABELS[d.key] ?? d.label)
    : habitDisplayLabel(d.label);

/* ----------------------------------------------------------- one row */

function HabitRow({
  d,
  reorder,
  first,
  last,
  editing,
  onEdit,
  onMove,
  onToggle,
  onSave,
  onDelete,
  notify,
  otherLabels,
}: {
  d: HabitDef;
  reorder: boolean;
  notify: (text: string) => void;
  first: boolean;
  last: boolean;
  editing: boolean;
  onEdit: () => void;
  onMove: (dir: -1 | 1) => void;
  onToggle: () => void;
  onSave: (v: {
    label: string;
    target: number | null;
    unit: string | null;
  }) => void;
  onDelete: () => void;
  otherLabels: string[];
}) {
  const can = editability({ key: d.key, kind: d.kind as HabitKind });
  const isAuto = d.kind === "auto";
  const label = displayName(d);
  const optional = !isAuto && isOptionalHabit(d.key, d.label);
  const caption = isAuto
    ? AUTO_SOURCE[d.key]
    : d.key === "steps"
      ? "Daily steps you enter"
      : d.kind === "value"
        ? `Goal ${formatTarget(d.target == null ? null : Number(d.target), d.unit)}`
        : "Tick it off each day";
  const icon =
    "press grid size-11 shrink-0 place-items-center rounded-field text-fg-2 transition-colors hover:text-fg disabled:text-fg-3 disabled:pointer-events-none";

  return (
    <li className="border-b border-line last:border-0">
      <div className="flex min-h-14 items-center gap-1">
        <span className="min-w-0 flex-1 pr-1">
          <span className="flex items-center gap-1.5">
            <span className="t-row truncate text-fg">
              {label}
            </span>
            {isAuto && <AutoBadge />}
            {optional && <OptionalBadge />}
          </span>
          <span className="t-label block truncate text-fg-2">
            {caption}
          </span>
        </span>
        {reorder ? (
          <>
            <button
              type="button"
              className={icon}
              disabled={first}
              onClick={() => onMove(-1)}
              aria-label={`Move ${label} up`}
            >
              <ArrowUp className="size-4" />
            </button>
            <button
              type="button"
              className={icon}
              disabled={last}
              onClick={() => onMove(1)}
              aria-label={`Move ${label} down`}
            >
              <ArrowDown className="size-4" />
            </button>
          </>
        ) : (
          <>
            {(can.rename || can.target || can.profileGoal) && (
              <button
                type="button"
                className={icon}
                onClick={onEdit}
                aria-expanded={editing}
                aria-label={`Edit ${label}`}
              >
                <Pencil className="size-4" />
              </button>
            )}
            <button
              type="button"
              className={icon}
              onClick={onToggle}
              aria-label={`Hide ${label}`}
            >
              <EyeOff className="size-4" />
            </button>
          </>
        )}
      </div>
      {editing &&
        !reorder &&
        (can.profileGoal ? (
          <StepsGoalEditor onDone={onEdit} notify={notify} />
        ) : (
          <EditForm
            d={d}
            canTarget={can.target}
            canRemove={can.remove}
            onSave={onSave}
            onDelete={onDelete}
            onCancel={onEdit}
            otherLabels={otherLabels}
          />
        ))}
    </li>
  );
}

function EditForm({
  d,
  canTarget,
  canRemove,
  onSave,
  onDelete,
  onCancel,
  otherLabels,
}: {
  d: HabitDef;
  canTarget: boolean;
  canRemove: boolean;
  onSave: (v: {
    label: string;
    target: number | null;
    unit: string | null;
  }) => void;
  onDelete: () => void;
  onCancel: () => void;
  otherLabels: string[];
}) {
  const [draft, setDraft] = useState<HabitDraft>({
    label: d.label,
    kind: d.kind === "value" ? "value" : "check",
    target: d.target == null ? "" : String(d.target),
    unit: d.unit ?? "",
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const submit = () => {
    const r = validateDraft(
      canTarget ? draft : { ...draft, kind: "check" },
      otherLabels,
    );
    if (!r.ok) return setErrors(r.errors);
    onSave({
      label: r.value.label,
      target: canTarget
        ? r.value.target
        : d.target == null
          ? null
          : Number(d.target),
      unit: canTarget ? r.value.unit : d.unit,
    });
  };
  return (
    <div className="mb-3 space-y-3 rounded-tile bg-card-2 p-3">
      <Field label="Name" error={errors.label}>
        {(id) => (
          <Input
            id={id}
            value={draft.label}
            maxLength={60}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
        )}
      </Field>
      {canTarget && (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Daily target" error={errors.target}>
            {(id) => (
              <NumberInput
                id={id}
                value={draft.target}
                enterKeyHint="done"
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            )}
          </Field>
          <Field label="Unit" error={errors.unit}>
            {(id) => (
              <Input
                id={id}
                value={draft.unit}
                maxLength={12}
                autoComplete="off"
                placeholder="min"
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
      <div className="flex items-center gap-2">
        {canRemove && (
          <Button
            variant="destructive"
            size="md"
            onClick={onDelete}
            className="px-4"
          >
            <Trash className="size-4" /> Delete
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="secondary" onClick={submit}>
          Save
        </Button>
      </div>
    </div>
  );
}

function StepsGoalEditor({
  onDone,
  notify,
}: {
  onDone: () => void;
  notify: (text: string) => void;
}) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const current = profile?.steps_goal ?? 8000;
  const [v, setV] = useState(current);
  return (
    <div className="mb-3 rounded-tile bg-card-2 p-3">
      <p className="t-label mb-2 font-semibold text-fg-2">
        Daily steps goal
      </p>
      <Stepper
        label="steps goal"
        value={v}
        step={500}
        min={1000}
        max={40000}
        onChange={setV}
        format={(n) => formatInt(n)}
        buttonClassName="bg-control"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          variant="secondary"
          disabled={v === current}
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              { values: { steps_goal: v }, reason: "Edited on Recovery" },
              {
                onSuccess: () => {
                  notify(
                    `Steps goal set to ${formatInt(v)}. Was ${formatInt(current)}.`,
                  );
                  onDone();
                },
              },
            )
          }
        >
          Save goal
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- add a habit */

function AddHabitForm({
  existing,
  onAdd,
}: {
  existing: HabitDef[];
  onAdd: (row: Upsertable) => void;
}) {
  const [draft, setDraft] = useState<HabitDraft>({
    label: "",
    kind: "check",
    target: "",
    unit: "",
  });
  const [errors, setErrors] = useState<DraftErrors>({});
  const busy = useRef(false);
  const submit = () => {
    if (busy.current) return;
    const r = validateDraft(
      draft,
      existing.map((d) => d.label),
    );
    if (!r.ok) return setErrors(r.errors);
    busy.current = true;
    onAdd({
      key: habitKeyFor(
        r.value.label,
        existing.map((d) => d.key),
      ),
      label: r.value.label,
      kind: r.value.kind,
      target: r.value.target,
      unit: r.value.unit,
      active: true,
      sort: nextSort(existing),
    });
    setDraft({ label: "", kind: draft.kind, target: "", unit: "" });
    setErrors({});
    window.setTimeout(() => (busy.current = false), 400);
  };
  return (
    <form
      className="mt-7 space-y-3 rounded-tile bg-card-2 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="t-label font-semibold">Add your own</p>
      <Field label="Name" error={errors.label}>
        {(id) => (
          <Input
            id={id}
            value={draft.label}
            maxLength={60}
            autoComplete="off"
            enterKeyHint="done"
            placeholder="e.g. Creatine 5 g"
            onChange={(e) => {
              setDraft({ ...draft, label: e.target.value });
              setErrors({});
            }}
          />
        )}
      </Field>
      <Segmented
        value={draft.kind}
        onChange={(k) => setDraft({ ...draft, kind: k })}
        options={[
          { value: "check", label: "Tick off" },
          { value: "value", label: "Number with target" },
        ]}
        ariaLabel="Habit type"
      />
      {draft.kind === "value" && (
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Daily target" error={errors.target}>
            {(id) => (
              <NumberInput
                id={id}
                value={draft.target}
                placeholder="10"
                enterKeyHint="done"
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              />
            )}
          </Field>
          <Field label="Unit" error={errors.unit}>
            {(id) => (
              <Input
                id={id}
                value={draft.unit}
                maxLength={12}
                placeholder="min"
                autoComplete="off"
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            )}
          </Field>
        </div>
      )}
      <Button type="submit" variant="secondary" block>
        <Plus className="size-4" /> Add habit
      </Button>
    </form>
  );
}
