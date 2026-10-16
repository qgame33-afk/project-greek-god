// The meal planner engine (docs/MEALS.md §4–5): pure functions over plain data. Callers (the
// data hooks and UI) persist what these return. Import from "@/lib/meals/engine".

export * from "./prefs";
export * from "./constraints";
export * from "./score";
export * from "./explain";
export * from "./plan";
export * from "./simplify";
export * from "./grocery";
export { hashString, rngFor, unitFor } from "./rng";
