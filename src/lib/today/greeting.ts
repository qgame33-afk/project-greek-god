// Greeting by time of day. Pure: callers pass the hour so this stays testable.

export type DayPart = "morning" | "afternoon" | "evening";

export function dayPart(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  return "evening";
}

/** First word of the display name, trimmed and length-capped. Null when there's nothing usable. */
export function firstName(displayName: string | null | undefined): string | null {
  const n = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!n || n.includes("@")) return null;
  return n.length > 18 ? n.slice(0, 18) : n;
}

/** "Good morning, Quinton" — rendered uppercase by the hero type style. */
export function greeting(hour: number, displayName?: string | null): string {
  const n = firstName(displayName);
  return `Good ${dayPart(hour)}${n ? `, ${n}` : ""}`;
}
