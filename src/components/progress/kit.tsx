"use client";

import { DropdownMenu } from "radix-ui";
import { Ellipsis, Pencil, Trash } from "lucide-react";
import type { LengthUnit, WeightUnit } from "@/lib/units";

/* --------------------------------------------------------- sr-only table */

/** The hidden data table that goes with every chart (VoiceOver reads the rows). */
export function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    // the wrapper is the visually hidden box: a table ignores width: 1px and would widen the page
    <div className="sr-only" data-budget-group="">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) =>
                j === 0 ? (
                  <th key={j} scope="row">
                    {c}
                  </th>
                ) : (
                  <td key={j}>{c}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------- row menu */

/** ⋯ menu with Edit / Delete: the visible equivalent of swipe actions. */
export function RowMenu({ label, onEdit, onDelete, deleteLabel = "Delete" }: { label: string; onEdit?: () => void; onDelete?: () => void; deleteLabel?: string }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger
        className="press grid size-11 shrink-0 place-items-center rounded-full text-fg-2 transition-colors hover:text-fg data-[state=open]:bg-control data-[state=open]:text-fg"
        aria-label={`More actions for ${label}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Ellipsis className="size-5" strokeWidth={1.9} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-(--z-confirm) min-w-44 rounded-tile-lg bg-card-3 p-1.5 data-[state=open]:animate-[rise_160ms_var(--ease-out)]"
          onClick={(e) => e.stopPropagation()}
        >
          {onEdit && (
            <DropdownMenu.Item onSelect={onEdit} className="t-row flex h-11 cursor-pointer items-center gap-2.5 rounded-tile px-3 outline-none data-[highlighted]:bg-control">
              <Pencil className="size-4 text-fg-2" strokeWidth={1.9} aria-hidden /> Edit
            </DropdownMenu.Item>
          )}
          {onDelete && (
            <DropdownMenu.Item onSelect={onDelete} className="t-row flex h-11 cursor-pointer items-center gap-2.5 rounded-tile px-3 text-danger outline-none data-[highlighted]:bg-danger-soft">
              <Trash className="size-4" strokeWidth={1.9} aria-hidden /> {deleteLabel}
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* ----------------------------------------------------------- formatting */

/** Signed number with a true minus: +0.42 / −0.30 / 0. */
export function signed(v: number | null | undefined, dp = 1) {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  if (r === 0) return (0).toFixed(dp);
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toFixed(dp)}`;
}

/* ---------------------------------------------------------------- units */

/**
 * The profile's display units (BRIEF 26 Oct: metric by default). Every number on Progress and the
 * recap is stored in lb / in and shown through lib/units with these; nothing is typed in a unit.
 */
export function unitsOf(profile: { weight_unit?: string | null; length_unit?: string | null } | null | undefined): { wu: WeightUnit; lu: LengthUnit } {
  return { wu: profile?.weight_unit === "lb" ? "lb" : "kg", lu: profile?.length_unit === "in" ? "in" : "cm" };
}

/** The spoken name of a weight unit, for VoiceOver ("kilograms"). */
export const weightWords = (u: WeightUnit) => (u === "kg" ? "kilograms" : "pounds");
/** The spoken name of a length unit ("centimetres"). */
export const lengthWords = (u: LengthUnit) => (u === "cm" ? "centimetres" : "inches");
