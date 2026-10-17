"use client";

import { useQueryClient } from "@tanstack/react-query";
import { DropdownMenu } from "radix-ui";
import { ChevronRight, Ellipsis, Pencil, Search, Trash } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FuelAmphora } from "@/components/art/icons";
import { Segmented } from "@/components/ui/controls";
import { Input } from "@/components/ui/field";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useUser } from "@/lib/data/core";
import { useSavedFoodMutations, useSavedFoods, useSavedMealMutations, useSavedMeals, type SavedFood, type SavedMeal } from "@/lib/data/nutrition";
import { cn } from "@/lib/cn";
import { formatAmount, macroLine } from "@/lib/nutrition-ui/format";
import { parseSavedMealItems, savedMealTotals } from "@/lib/nutrition-ui/savedMeal";
import { formatInt } from "@/lib/units";
import { StarButton } from "./bits";

type Kind = "foods" | "meals";

export function SavedPanel({
  onPickFood,
  onPickMeal,
  onEditFood,
}: {
  onPickFood: (f: SavedFood) => void;
  onPickMeal: (m: SavedMeal) => void;
  onEditFood: (f: SavedFood) => void;
}) {
  const [kind, setKind] = useState<Kind>("foods");
  const [filter, setFilter] = useState("");
  const foods = useSavedFoods();
  const meals = useSavedMeals();
  const nFoods = foods.data?.length ?? 0;
  const nMeals = meals.data?.length ?? 0;

  return (
    <div>
      <Segmented
        size="sm"
        ariaLabel="Saved"
        value={kind}
        onChange={(k) => setKind(k)}
        options={[
          { value: "foods", label: `Foods${nFoods ? ` · ${nFoods}` : ""}` },
          { value: "meals", label: `Meals${nMeals ? ` · ${nMeals}` : ""}` },
        ]}
      />
      {((kind === "foods" && nFoods > 6) || (kind === "meals" && nMeals > 6)) && (
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[1.125rem] -translate-y-1/2 text-ash" aria-hidden />
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={kind === "foods" ? "Filter saved foods" : "Filter saved meals"} aria-label="Filter" autoComplete="off" className="pl-11" enterKeyHint="search" />
        </div>
      )}
      <div className="mt-2">
        {kind === "foods" ? <FoodsList q={filter} onPick={onPickFood} onEdit={onEditFood} /> : <MealsList q={filter} onPick={onPickMeal} />}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 border-b border-vein py-3">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function FoodsList({ q, onPick, onEdit }: { q: string; onPick: (f: SavedFood) => void; onEdit: (f: SavedFood) => void }) {
  const foods = useSavedFoods();
  const m = useSavedFoodMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = foods.data ?? [];
    return t ? all.filter((f) => f.name.toLowerCase().includes(t) || (f.brand ?? "").toLowerCase().includes(t)) : all;
  }, [foods.data, q]);

  if (foods.isLoading) return <ListSkeleton />;
  if (foods.error) return <ErrorNote onRetry={() => foods.refetch()}>Couldn&apos;t load saved foods.</ErrorNote>;
  if (!foods.data?.length)
    return (
      <Empty className="mt-3" art={<FuelAmphora className="size-10 text-ui-line" />} title="No saved foods yet">
        Turn on “Save to my foods” when you log something, or save any entry from its edit sheet.
      </Empty>
    );
  if (!list.length) return <p className="py-6 text-center t-callout text-ash">No saved foods match “{q.trim()}”.</p>;

  const star = (f: SavedFood) => {
    const next = !f.is_favorite;
    const key = ["saved-foods", userId];
    const prev = qc.getQueryData<SavedFood[]>(key);
    qc.setQueryData<SavedFood[]>(key, (l) => l?.map((x) => (x.id === f.id ? { ...x, is_favorite: next } : x)));
    m.update.mutate({ id: f.id, values: { is_favorite: next } }, { onError: () => qc.setQueryData(key, prev) });
  };

  const remove = (f: SavedFood) => {
    const key = ["saved-foods", userId];
    const prev = qc.getQueryData<SavedFood[]>(key);
    qc.setQueryData<SavedFood[]>(key, (l) => l?.filter((x) => x.id !== f.id));
    m.remove.mutate(f.id, {
      onError: () => qc.setQueryData(key, prev),
      onSuccess: () =>
        toast(`Removed ${f.name}`, {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              const { user_id: _u, ...rest } = f;
              void _u;
              m.create.mutate(rest);
            },
          },
        }),
    });
  };

  return (
    <ul>
      {list.map((f) => (
        <li key={f.id} className="flex items-center gap-1 border-b border-vein last:border-b-0">
          <StarButton on={f.is_favorite} onToggle={() => star(f)} label={f.is_favorite ? `Unfavourite ${f.name}` : `Favourite ${f.name}`} className="-ml-2.5" />
          <button type="button" onClick={() => onPick(f)} className="press-soft min-w-0 flex-1 py-2.5 text-left">
            <p className="truncate t-callout font-semibold text-ivory">{f.name}</p>
            <p className="tnum mt-0.5 truncate t-meta text-ash">
              {formatAmount(Number(f.serving_amount), f.serving_unit)} · {formatInt(Number(f.calories))} kcal · {macroLine({ protein: Number(f.protein_g), carbs: Number(f.carbs_g), fat: Number(f.fat_g) })}
            </p>
          </button>
          <RowMenu name={f.name} onEdit={() => onEdit(f)} onDelete={() => remove(f)} />
        </li>
      ))}
    </ul>
  );
}

function MealsList({ q, onPick }: { q: string; onPick: (m: SavedMeal) => void }) {
  const meals = useSavedMeals();
  const m = useSavedMealMutations();
  const qc = useQueryClient();
  const { userId } = useUser();
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = meals.data ?? [];
    return t ? all.filter((x) => x.name.toLowerCase().includes(t)) : all;
  }, [meals.data, q]);

  if (meals.isLoading) return <ListSkeleton />;
  if (meals.error) return <ErrorNote onRetry={() => meals.refetch()}>Couldn&apos;t load saved meals.</ErrorNote>;
  if (!meals.data?.length)
    return (
      <Empty className="mt-3" art={<FuelAmphora className="size-10 text-ui-line" />} title="No saved meals yet">
        Use “Save as meal” in a meal card&apos;s menu to reuse a whole meal in one tap.
      </Empty>
    );
  if (!list.length) return <p className="py-6 text-center t-callout text-ash">No saved meals match “{q.trim()}”.</p>;

  const key = ["saved-meals", userId];
  const star = (x: SavedMeal) => {
    const next = !x.is_favorite;
    const prev = qc.getQueryData<SavedMeal[]>(key);
    qc.setQueryData<SavedMeal[]>(key, (l) => l?.map((y) => (y.id === x.id ? { ...y, is_favorite: next } : y)));
    m.update.mutate({ id: x.id, values: { is_favorite: next } }, { onError: () => qc.setQueryData(key, prev) });
  };
  const remove = (x: SavedMeal) => {
    const prev = qc.getQueryData<SavedMeal[]>(key);
    qc.setQueryData<SavedMeal[]>(key, (l) => l?.filter((y) => y.id !== x.id));
    m.remove.mutate(x.id, {
      onError: () => qc.setQueryData(key, prev),
      onSuccess: () =>
        toast(`Removed ${x.name}`, {
          duration: 6000,
          action: {
            label: "Undo",
            onClick: () => {
              const { user_id: _u, ...rest } = x;
              void _u;
              m.create.mutate(rest);
            },
          },
        }),
    });
  };

  return (
    <ul>
      {list.map((x) => {
        const items = parseSavedMealItems(x.items);
        const t = savedMealTotals(items);
        return (
          <li key={x.id} className="flex items-center gap-1 border-b border-vein last:border-b-0">
            <StarButton on={x.is_favorite} onToggle={() => star(x)} label={x.is_favorite ? `Unfavourite ${x.name}` : `Favourite ${x.name}`} className="-ml-2.5" />
            <button type="button" onClick={() => onPick(x)} className="press-soft flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate t-callout font-semibold text-ivory">{x.name}</span>
                <span className="tnum mt-0.5 block truncate t-meta text-ash">
                  {items.length} {items.length === 1 ? "item" : "items"} · {formatInt(t.calories)} kcal · {macroLine(t)}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-ash" aria-hidden />
            </button>
            <RowMenu name={x.name} onDelete={() => remove(x)} />
          </li>
        );
      })}
    </ul>
  );
}

function RowMenu({ name, onEdit, onDelete }: { name: string; onEdit?: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger aria-label={`${name} options`} className="press -mr-2 grid size-11 shrink-0 place-items-center rounded-field text-ash hover:text-ivory data-[state=open]:text-ivory">
        <Ellipsis className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={4} className="z-(--z-confirm) min-w-[11.25rem] rounded-field border border-vein-3 bg-m3 p-1.5 shadow-(--e2) outline-none">
          {onEdit && (
            <DropdownMenu.Item onSelect={onEdit} className="flex h-11 cursor-pointer select-none items-center gap-3 rounded-field px-3 t-callout font-semibold text-ivory outline-none data-[highlighted]:bg-m4">
              <Pencil className="size-[1.125rem] text-stone" /> Edit
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item onSelect={onDelete} className={cn("flex h-11 cursor-pointer select-none items-center gap-3 rounded-field px-3 t-callout font-semibold text-cinnabar outline-none data-[highlighted]:bg-m4")}>
            <Trash className="size-[1.125rem]" /> Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
