// RFC 4180 CSV with spreadsheet-safe cells. Pure — unit-tested.

type Cell = string | number | boolean | null | undefined | object;

/**
 * One CSV cell.
 * - null/undefined → empty
 * - objects/arrays → compact JSON
 * - quotes doubled; the cell is quoted when it holds a comma, quote, CR/LF or edge spaces
 * - text that a spreadsheet would run as a formula (=, +, @, tab, CR, or "-" not followed by
 *   a number) gets a leading apostrophe. Real numbers are never altered.
 */
export function csvCell(v: Cell): string {
  if (v == null) return "";
  let s: string;
  if (typeof v === "number") s = Number.isFinite(v) ? String(v) : "";
  else if (typeof v === "boolean") s = v ? "true" : "false";
  else if (typeof v === "object") s = JSON.stringify(v);
  else {
    s = v;
    if (/^[=+@\t\r]/.test(s) || (/^-/.test(s) && !/^-\d+(\.\d+)?$/.test(s))) s = "'" + s;
  }
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Column order: keys of the first row, then any extra keys in first-seen order. */
export function csvColumns(rows: Record<string, unknown>[]): string[] {
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows)
    for (const k of Object.keys(r))
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
  return cols;
}

/** A whole table as CSV (CRLF line endings, header row). Empty input → empty string. */
export function toCSV(rows: Record<string, unknown>[], columns = csvColumns(rows)): string {
  if (!columns.length) return "";
  const lines = [columns.map((c) => csvCell(c)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c] as Cell)).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Bytes → "1.2 MB" / "340 KB" / "512 B". */
export function formatBytes(n: number) {
  if (!(n > 0)) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
