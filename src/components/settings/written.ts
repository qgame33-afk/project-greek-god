// Which goal history rows a Settings save just wrote (pure, so it's unit-tested). Undo takes
// exactly those back out: an undone change never happened, so it must not leave two history
// entries or restart the calorie rule's wait.

export interface GoalChangeRow {
  id: string;
  field: string;
  old_value: number | null;
  new_value: number;
}

/**
 * For each saved field, the newest history row, if it records exactly this change (previous →
 * saved value). `rows` must be newest first. Fields with no matching row (names, units, a value
 * that didn't change) give nothing.
 */
export function writtenRowIds(rows: readonly GoalChangeRow[], values: Record<string, unknown>, prev: Record<string, unknown>): string[] {
  const ids: string[] = [];
  for (const f of Object.keys(values)) {
    const r = rows.find((x) => x.field === f);
    if (!r || values[f] == null || Number(r.new_value) !== Number(values[f])) continue;
    if (prev[f] == null ? r.old_value != null : Number(r.old_value) !== Number(prev[f])) continue;
    ids.push(r.id);
  }
  return ids;
}
