"use client";

import { DropdownMenu } from "radix-ui";
import { BookmarkPlus, CalendarDays, Ellipsis, ImageIcon, Layers, Pencil, Plus, Trash } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useSignedUrls } from "@/lib/data/body";
import { useDeleteFood, type FoodEntry } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { composeEatenAt, formatAmount, formatClock, macroLine, timeValue } from "@/lib/nutrition-ui/format";
import { cloneEntry } from "@/lib/nutrition-ui/portion";
import { newId } from "@/lib/data/core";
import type { MealSection } from "@/lib/nutrition-ui/group";
import { groupLabel } from "@/lib/nutrition-ui/provenance";
import { formatInt } from "@/lib/units";
import { RowProvenance } from "./bits";
import { useFuel } from "./context";
import { RowAction, SwipeRow } from "./SwipeRow";

export function MealCard({
  section,
  openRow,
  setOpenRow,
  onSaveMeal,
}: {
  section: MealSection<FoodEntry>;
  openRow: string | null;
  setOpenRow: (id: string | null) => void;
  onSaveMeal: (s: MealSection<FoodEntry>) => void;
}) {
  const { openLog, openEdit, date, today, log } = useFuel();
  const del = useDeleteFood();
  const { meal, label, entries, totals, items } = section;
  const empty = entries.length === 0;

  /** Same foods, same times of day, logged again today (groups stay grouped). */
  const copyToToday = () => {
    const groups = new Map<string, string>();
    const rows = entries.map((e) => {
      let gid: string | null = null;
      if (e.meal_group_id) {
        gid = groups.get(e.meal_group_id) ?? newId();
        groups.set(e.meal_group_id, gid);
      }
      return cloneEntry(e, { id: newId(), date: today, eatenAt: composeEatenAt(today, timeValue(e.eaten_at)), groupId: gid });
    });
    void log(rows, { meal, name: null, detail: `${rows.length} ${rows.length === 1 ? "item" : "items"} · ${formatInt(totals.calories)} kcal` });
  };

  // a double tap on Delete / Remove all sends one delete, not two (and one Undo toast)
  const removing = useRef(new Set<string>());
  const remove = (rows: FoodEntry[], what?: string) => {
    setOpenRow(null);
    const fresh = rows.filter((r) => !removing.current.has(r.id));
    if (!fresh.length) return;
    fresh.forEach((r) => removing.current.add(r.id));
    del
      .mutateAsync({ ids: fresh.map((r) => r.id), date, rows: fresh, label: what })
      .catch(() => {}) // the shared hook rolled back and explained
      .finally(() => fresh.forEach((r) => removing.current.delete(r.id)));
  };

  return (
    <section className="card-instrument @container overflow-hidden" aria-labelledby={`meal-${meal}`}>
      <header className="flex items-center gap-1 py-2 pl-4 pr-1.5 sm:pl-5">
        <div className="min-w-0 flex-1 py-1">
          <div className="flex items-baseline gap-2.5">
            <h2 id={`meal-${meal}`} className="t-h3">
              {label}
            </h2>
            {!empty && (
              <span className="num text-[16px] font-semibold text-fg-2">
                {formatInt(totals.calories)}
                <span className="unit !text-[12px]">kcal</span>
              </span>
            )}
          </div>
          {!empty && <p className="num mt-0.5 text-[13px] text-fg-3">{macroLine(totals)}</p>}
        </div>
        <button
          type="button"
          onClick={() => openLog({ meal })}
          aria-label={`Add to ${label}`}
          className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-gold-300 hover:bg-gold-tint"
        >
          <Plus className="size-[22px]" strokeWidth={2} />
        </button>
        <MealMenu
          label={label}
          disabled={empty}
          canCopy={date < today}
          onAdd={() => openLog({ meal })}
          onSave={() => onSaveMeal(section)}
          onCopy={copyToToday}
          onRemoveAll={() => remove(entries, `Removed ${label} · ${entries.length} ${entries.length === 1 ? "item" : "items"}`)}
        />
      </header>

      {empty ? (
        <div className="flex h-[52px] items-center justify-between border-t border-line-hair pl-4 pr-2 sm:pl-5">
          <span className="text-[14px] font-medium text-fg-3">Nothing logged</span>
          <button type="button" onClick={() => openLog({ meal })} className="inline-flex h-11 items-center px-3 text-[14px] font-bold text-gold-300 hover:text-gold-200">
            Add
          </button>
        </div>
      ) : (
        <ul className="border-t border-line-hair">
          {items.map((it) =>
            it.kind === "entry" ? (
              <li key={it.entry.id} className="border-b border-line-hair last:border-b-0">
                <FoodRow
                  entry={it.entry}
                  open={openRow === it.entry.id}
                  setOpen={(o) => setOpenRow(o ? it.entry.id : null)}
                  onEdit={() => {
                    setOpenRow(null);
                    openEdit(it.entry);
                  }}
                  onDelete={() => remove([it.entry])}
                />
              </li>
            ) : (
              <li key={it.id} className="border-b border-line-hair last:border-b-0">
                <div className="flex h-11 items-center gap-2 bg-white/[.015] pl-4 pr-1 sm:pl-5">
                  {groupPhoto(it.entries) ? (
                    <GroupPhoto path={groupPhoto(it.entries)!} label={groupLabel(it.entries[0].source).toLowerCase()} />
                  ) : (
                    <Layers className="size-3.5 shrink-0 text-fg-3" aria-hidden />
                  )}
                  <span className="flex min-w-0 flex-1 items-baseline gap-2 truncate">
                    <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.14em] text-fg-3">{groupLabel(it.entries[0].source)}</span>
                    <span className="truncate text-[12.5px] font-medium text-fg-3">
                      {it.entries.length} items · <span className="num text-[13.5px]">{formatInt(it.totals.calories)}</span> kcal
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(it.entries, `Removed ${groupLabel(it.entries[0].source).toLowerCase()} · ${it.entries.length} items`)}
                    className="inline-flex h-11 shrink-0 items-center px-3 text-[13px] font-bold text-fg-2 hover:text-fg"
                    aria-label={`Remove all ${it.entries.length} items from this ${groupLabel(it.entries[0].source).toLowerCase()}`}
                  >
                    Remove all
                  </button>
                </div>
                <ul className="relative before:pointer-events-none before:absolute before:inset-y-3 before:left-[23px] before:z-[2] before:w-px before:bg-line-strong sm:before:left-[27px]">
                  {it.entries.map((e) => (
                    <li key={e.id} className="border-t border-line-hair pl-4">
                      <FoodRow
                        entry={e}
                        open={openRow === e.id}
                        setOpen={(o) => setOpenRow(o ? e.id : null)}
                        onEdit={() => {
                          setOpenRow(null);
                          openEdit(e);
                        }}
                        onDelete={() => remove([e])}
                      />
                    </li>
                  ))}
                </ul>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

/** The private photo a scanned meal was saved with, if any. */
const groupPhoto = (entries: FoodEntry[]) => entries.find((e) => e.photo_path)?.photo_path ?? null;

/** Thumbnail of a privately saved meal photo; tap to see it full size. */
function GroupPhoto({ path, label }: { path: string; label: string }) {
  const urls = useSignedUrls("meal-photos", [path]);
  const url = urls.data?.[path];
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`View the ${label} photo`}
        className="press -my-1.5 -ml-1.5 grid size-11 shrink-0 place-items-center"
      >
        <span className="grid size-8 place-items-center overflow-hidden rounded-[8px] border border-line bg-s3">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
            <img src={url} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-4 text-fg-3" aria-hidden />
          )}
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="Meal photo" description="Saved privately. Only you can see it.">
        <div className="pb-4 pt-2">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
            <img src={url} alt={`Photo of this ${label}`} className="max-h-[70dvh] w-full rounded-[14px] border border-line object-contain" />
          ) : urls.isError ? (
            <p className="py-8 text-center text-[13px] text-fg-2">The photo couldn&apos;t be loaded.</p>
          ) : (
            <Skeleton className="aspect-[4/3] w-full rounded-[14px]" />
          )}
        </div>
      </Sheet>
    </>
  );
}

function FoodRow({ entry, open, setOpen, onEdit, onDelete }: { entry: FoodEntry; open: boolean; setOpen: (o: boolean) => void; onEdit: () => void; onDelete: () => void }) {
  const { flashIds } = useFuel();
  const flash = flashIds.has(entry.id);
  const kcal = Number(entry.calories);
  return (
    <SwipeRow
      open={open}
      onOpenChange={setOpen}
      onTap={onEdit}
      label={`${entry.name}, ${formatAmount(Number(entry.amount), entry.unit)}, ${formatInt(kcal)} kilocalories. Edit`}
      actions={
        <>
          <RowAction onClick={onEdit} label={`Edit ${entry.name}`}>
            <Pencil className="size-[18px]" />
            Edit
          </RowAction>
          <RowAction onClick={onDelete} tone="danger" label={`Delete ${entry.name}`}>
            <Trash className="size-[18px]" />
            Delete
          </RowAction>
        </>
      }
    >
      <div className={cn("flex h-[60px] items-center gap-3 pl-4 pr-4 transition-colors hover:bg-white/[.02] sm:pl-5 sm:pr-5", flash && "flash-gold")}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-fg">{entry.name}</p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            {/* amount · time is core row content; the badge gives way first */}
            <span className="shrink-0 whitespace-nowrap text-[12.5px] font-medium text-fg-3">
              {formatAmount(Number(entry.amount), entry.unit)} · {formatClock(entry.eaten_at)}
            </span>
            <RowProvenance item={entry} />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-[18px] font-semibold leading-none text-fg">
            {formatInt(kcal)}
            <span className="unit !text-[12px]">kcal</span>
          </p>
          <p className="num mt-1 text-[12.5px] text-fg-3">{macroLine({ protein: Number(entry.protein_g), carbs: Number(entry.carbs_g), fat: Number(entry.fat_g) })}</p>
        </div>
      </div>
    </SwipeRow>
  );
}

function MealMenu({
  label,
  disabled,
  canCopy,
  onAdd,
  onSave,
  onCopy,
  onRemoveAll,
}: {
  label: string;
  disabled: boolean;
  canCopy: boolean;
  onAdd: () => void;
  onSave: () => void;
  onCopy: () => void;
  onRemoveAll: () => void;
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        aria-label={`${label} options`}
        className="press grid size-11 shrink-0 place-items-center rounded-[12px] text-fg-2 hover:text-fg data-[state=open]:bg-s3 data-[state=open]:text-fg"
      >
        <Ellipsis className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-[45] min-w-[220px] rounded-[14px] border border-line-strong bg-s3 p-1.5 shadow-[var(--e2)] outline-none data-[state=open]:animate-[rise_160ms_var(--ease-out)]"
        >
          <MenuItem icon={<Plus className="size-[18px]" />} onSelect={onAdd}>
            Add food
          </MenuItem>
          <MenuItem icon={<BookmarkPlus className="size-[18px]" />} onSelect={onSave} disabled={disabled}>
            Save as meal
          </MenuItem>
          {canCopy && (
            <MenuItem icon={<CalendarDays className="size-[18px]" />} onSelect={onCopy} disabled={disabled}>
              Copy to today
            </MenuItem>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-line" />
          <MenuItem icon={<Trash className="size-[18px]" />} onSelect={onRemoveAll} disabled={disabled} danger>
            Remove all
          </MenuItem>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function MenuItem({ icon, children, onSelect, disabled, danger }: { icon: ReactNode; children: ReactNode; onSelect: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex h-11 cursor-pointer select-none items-center gap-3 rounded-[10px] px-3 text-[14px] font-semibold outline-none data-[disabled]:cursor-default data-[disabled]:opacity-40 data-[highlighted]:bg-s4",
        danger ? "text-danger" : "text-fg",
      )}
    >
      <span className={danger ? "text-danger" : "text-fg-2"}>{icon}</span>
      {children}
    </DropdownMenu.Item>
  );
}

export function MealCardSkeleton() {
  return (
    <div className="card-instrument p-4" aria-hidden>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-2 h-3.5 w-40" />
      <div className="mt-4 space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  );
}
