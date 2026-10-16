"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash,
} from "lucide-react";
import { toast } from "sonner";
import { AutoBadge } from "@/components/ui/badge";
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
  habitKeyFor,
  moveHabit,
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
import { cn } from "@/lib/cn";

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
>;
const toUpsert = (d: Upsertable) => ({
  key: d.key,
  label: d.label,
  kind: d.kind,
  target: d.target,
  unit: d.unit,
  active: d.active,
  sort: d.sort,
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
      title="Customise habits"
      description="Show, hide, reorder or add your own."
      wide
    >
      {open && <CustomiseBody />}
    </Sheet>
  );
}

function CustomiseBody() {
  const defs = useHabitDefs();
  const { upsert, remove } = useHabitDefMutations();
  const patch = useHabitDefsCache();
  const { userId } = useUser();
  const [editing, setEditing] = useState<string | null>(null);
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
    const { changed } = moveHabit(
      list.map((d) => ({ ...d, kind: d.kind as "auto" | "value" | "check" })),
      key,
      dir,
    );
    if (changed.length) write(changed);
  };

  const setActive = (d: HabitDef, active: boolean) => write([{ ...d, active }]);

  /** Delete a custom habit. `quiet` skips the Undo toast (used when undoing an add). */
  const del = (d: HabitDef, quiet = false) => {
    const rollback = patch((cur) => cur.filter((x) => x.key !== d.key));
    remove.mutate(d.id, {
      onError: rollback,
      onSuccess: () => {
        if (quiet) return;
        toast(`Removed “${d.label}”`, {
          description: "Its past check marks are kept.",
          duration: 6000,
          action: { label: "Undo", onClick: () => write([d]) },
        });
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
      toast(`“${d.label}” is back on your list`);
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
    write([row], ([saved]) => undoableAddToast(saved));
  };

  const undoableAddToast = (saved: HabitDef) =>
    toast(`Added “${saved.label}”`, {
      duration: 6000,
      action: { label: "Undo", onClick: () => del(saved, true) },
    });

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
      <p className="eyebrow mb-1 mt-1">On your list · {active.length}</p>
      <ul>
        {active.map((d) => {
          const idx = list.findIndex((x) => x.key === d.key);
          return (
            <HabitRow
              key={d.key}
              d={d}
              first={idx === 0}
              last={idx === list.length - 1}
              editing={editing === d.key}
              onEdit={() => setEditing(editing === d.key ? null : d.key)}
              onMove={(dir) => move(d.key, dir)}
              onToggle={() => setActive(d, false)}
              onSave={(v) => {
                write([{ ...d, ...v }]);
                setEditing(null);
              }}
              onDelete={() => del(d)}
              otherLabels={list
                .filter((x) => x.key !== d.key)
                .map((x) => x.label)}
            />
          );
        })}
      </ul>

      {hidden.length > 0 && (
        <>
          <p className="eyebrow mb-1 mt-6">Hidden · {hidden.length}</p>
          <ul>
            {hidden.map((d) => (
              <li
                key={d.key}
                className="flex min-h-14 items-center gap-3 border-b border-line-hair last:border-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-fg-2">
                    {d.kind === "auto"
                      ? (AUTO_LABELS[d.key] ?? d.label)
                      : d.label}
                  </span>
                  <span className="block truncate text-[12px] text-fg-3">
                    Not counted toward your day
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-11"
                  onClick={() => setActive(d, true)}
                >
                  <Eye className="size-4" /> Show
                </Button>
                {editability({ key: d.key, kind: d.kind as HabitKind })
                  .remove && (
                  <button
                    type="button"
                    onClick={() => del(d)}
                    className="grid size-11 place-items-center rounded-[12px] text-fg-3 hover:text-danger"
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

      <p className="eyebrow mb-2 mt-7">Suggestions</p>
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
                  : `Add ${p.label}`
              }
            >
              {st === "active" ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
              {p.label}
              {p.target ? (
                <span className="text-fg-3">
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
          write([row], ([saved]) => undoableAddToast(saved));
        }}
      />
    </div>
  );
}

/* ----------------------------------------------------------- one row */

function HabitRow({
  d,
  first,
  last,
  editing,
  onEdit,
  onMove,
  onToggle,
  onSave,
  onDelete,
  otherLabels,
}: {
  d: HabitDef;
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
  const label = isAuto ? (AUTO_LABELS[d.key] ?? d.label) : d.label;
  const caption = isAuto
    ? AUTO_SOURCE[d.key]
    : d.key === "steps"
      ? "Daily steps you enter"
      : d.kind === "value"
        ? `Goal ${formatTarget(d.target == null ? null : Number(d.target), d.unit)}`
        : "Tick it off each day";
  const icon =
    "grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-3 transition-colors hover:text-fg disabled:text-fg-dis disabled:pointer-events-none";

  return (
    <li className="border-b border-line-hair last:border-0">
      <div className="flex min-h-14 items-center gap-1">
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            className={cn(icon, "h-7")}
            disabled={first}
            onClick={() => onMove(-1)}
            aria-label={`Move ${label} up`}
          >
            <ArrowUp className="size-4" />
          </button>
          <button
            type="button"
            className={cn(icon, "h-7")}
            disabled={last}
            onClick={() => onMove(1)}
            aria-label={`Move ${label} down`}
          >
            <ArrowDown className="size-4" />
          </button>
        </div>
        <span className="min-w-0 flex-1 pl-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold text-fg">
              {label}
            </span>
            {isAuto && <AutoBadge />}
          </span>
          <span className="block truncate text-[12px] text-fg-3">
            {caption}
          </span>
        </span>
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
      </div>
      {editing &&
        (can.profileGoal ? (
          <StepsGoalEditor onDone={onEdit} />
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
    <div className="card-inset mb-3 space-y-3 p-3">
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

function StepsGoalEditor({ onDone }: { onDone: () => void }) {
  const { profile } = useProfile();
  const save = useSaveProfile();
  const current = profile?.steps_goal ?? 8000;
  const [v, setV] = useState(current);
  return (
    <div className="card-inset mb-3 p-3">
      <p className="mb-2 text-[13px] font-semibold text-fg-2">
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
                  toast(`Steps goal set to ${formatInt(v)}`, {
                    description: `Was ${formatInt(current)}.`,
                  });
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
      className="card-inset mt-7 space-y-3 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="eyebrow">Add your own</p>
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
