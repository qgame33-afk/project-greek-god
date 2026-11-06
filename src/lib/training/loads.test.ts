import { describe, expect, it } from "vitest";
import { formatLoad, LB_PER_KG } from "@/lib/units";
import { platesFor, platesLabel } from "@/lib/workout/plates";
import { getExercise } from "./library";
import { BAR, displayBodyweight, displayLoad, loadStep, loadText, scaleLoad, stepUp, storeBodyweight, storeLoad } from "./loads";

/** numeric(6,1) / numeric(5,1): what Postgres keeps of a stored pound value. */
const column = (lb: number) => Math.round(lb * 10) / 10;

describe("kg loads round-trip through the pound columns (PROGRAM-V3 §2)", () => {
  it("every 0.5 kg from 0 to 300 kg comes back exactly", () => {
    for (let i = 0; i <= 600; i++) {
      const kg = i / 2;
      const stored = column(storeLoad(kg, "kg"));
      expect(displayLoad(stored, "kg"), `${kg} kg`).toBe(kg);
      expect(loadText(stored, "kg"), `${kg} kg`).toBe(`${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`);
      // the foundation formatter shows the same number
      expect(formatLoad(stored, "kg"), `${kg} kg`).toBe(loadText(stored, "kg"));
    }
  });

  it("22.5 kg is 49.6 lb in the database and 22.5 kg on screen; it is never converted twice", () => {
    expect(storeLoad(22.5, "kg")).toBe(49.6);
    expect(displayLoad(49.6, "kg")).toBe(22.5);
    expect(loadText(49.6, "kg")).toBe("22.5 kg");
    // reading back and saving again is a no-op
    expect(storeLoad(displayLoad(storeLoad(22.5, "kg"), "kg"), "kg")).toBe(49.6);
    expect(storeLoad(100, "kg")).toBe(220.5);
  });

  it("an account in lb stores what he types and shows it back (whole and half pounds)", () => {
    for (const lb of [2.5, 45, 47.5, 50, 135, 185.5, 225, 1000]) {
      expect(storeLoad(lb, "lb")).toBe(lb);
      expect(displayLoad(lb, "lb")).toBe(lb);
      expect(loadText(column(storeLoad(lb, "lb")), "lb")).toBe(`${lb} lb`);
      expect(formatLoad(lb, "lb")).toBe(`${lb} lb`);
    }
    expect(loadText(185, "lb")).toBe("185 lb");
    // every half pound from 0 to 1,500 round-trips through numeric(6,1)
    for (let i = 0; i <= 3000; i++) {
      const lb = i / 2;
      expect(displayLoad(column(storeLoad(lb, "lb")), "lb"), `${lb} lb`).toBe(lb);
    }
  });

  it("50 lb typed is 50 in the database and 50 lb on screen, never 49.6", () => {
    expect(storeLoad(50, "lb")).toBe(50);
    expect(loadText(storeLoad(50, "lb"), "lb")).toBe("50 lb");
    // a stray tenth lands on the half-pound grid it is shown on
    expect(storeLoad(49.6, "lb")).toBe(49.5);
    expect(storeLoad(47.3, "lb")).toBe(47.5);
  });

  it("sets typed in kg earlier show their pound value on the 0.5 lb grid", () => {
    expect(loadText(49.6, "lb")).toBe("49.5 lb"); // 22.5 kg
    expect(loadText(storeLoad(84, "kg"), "lb")).toBe("185 lb"); // 185.2
    expect(loadText(storeLoad(60, "kg"), "lb")).toBe("132.5 lb"); // 132.3
    expect(loadText(storeLoad(20, "kg"), "lb")).toBe("44 lb"); // 44.1
    expect(formatLoad(49.6, "lb")).toBe("49.5 lb");
  });

  it("bodyweight in lb keeps one decimal (165.4 stays 165.4)", () => {
    expect(storeBodyweight(165.4, "lb")).toBe(165.4);
    expect(displayBodyweight(165.4, "lb")).toBe(165.4);
    for (let i = 800; i <= 4000; i++) expect(displayBodyweight(column(storeBodyweight(i / 10, "lb")), "lb")).toBe(i / 10);
  });

  it("old pound history shows on the 0.5 kg grid (185 lb → 84 kg, 50 lb → 22.5 kg)", () => {
    expect(loadText(185, "kg")).toBe("84 kg");
    expect(loadText(50, "kg")).toBe("22.5 kg");
    expect(loadText(135, "kg")).toBe("61 kg");
    expect(loadText(null, "kg")).toBe("—");
    // the stored value itself never changes
    expect(185 / LB_PER_KG).toBeCloseTo(83.91, 2);
  });

  it("bodyweight round-trips every 0.1 kg from 40 to 150 kg", () => {
    for (let i = 400; i <= 1500; i++) {
      const kg = i / 10;
      expect(displayBodyweight(column(storeBodyweight(kg, "kg")), "kg"), `${kg} kg`).toBe(kg);
    }
    expect(displayBodyweight(163, "kg")).toBe(73.9);
  });

  it("lengths: the measurement columns (numeric(4,2)/(5,2) inches) keep 0.1 cm", () => {
    for (let i = 100; i <= 1500; i++) {
      const cm = i / 10;
      const stored = Math.round((cm / 2.54) * 100) / 100; // 0.01 in = 0.0254 cm < 0.05 cm
      expect(Math.round((stored * 2.54) * 10) / 10, `${cm} cm`).toBe(cm);
    }
  });
});

describe("load steps in lb", () => {
  it("barbell and Smith 5 lb total, dumbbells 5 lb per hand (2.5 when the library says so), stacks 5 lb", () => {
    expect(loadStep(getExercise("back-squat"), "lb")).toBe(5);
    expect(loadStep(getExercise("romanian-deadlift"), "lb")).toBe(5);
    expect(loadStep(getExercise("barbell-bench-press"), "lb")).toBe(5);
    expect(loadStep(getExercise("incline-smith-press"), "lb")).toBe(5);
    expect(loadStep(getExercise("incline-db-press"), "lb")).toBe(5);
    expect(loadStep(getExercise("seated-db-shoulder-press"), "lb")).toBe(5);
    expect(loadStep(getExercise("lat-pulldown"), "lb")).toBe(5);
    expect(loadStep(getExercise("machine-chest-press"), "lb")).toBe(5);
    expect(loadStep(getExercise("cable-triceps-pushdown"), "lb")).toBe(5);
    expect(loadStep(getExercise("db-lateral-raise"), "lb")).toBe(5);
    expect(loadStep(undefined, "lb")).toBe(5);
    // the library's 2.5 lb increment: light dumbbells, added load on bodyweight lifts
    expect(loadStep({ equipment: "dumbbell", increment: 2.5, perHand: true }, "lb")).toBe(2.5);
    expect(loadStep(getExercise("weighted-pull-up"), "lb")).toBe(2.5);
    // a 5 lb plate on each side of a plate-loaded sled
    expect(loadStep(getExercise("leg-press"), "lb")).toBe(10);
  });

  it("the progression step goes up 5 lb from 50 and lands old kg loads on the step grid", () => {
    const db = getExercise("incline-db-press");
    expect(stepUp(50, db, "lb")).toBe(55);
    expect(stepUp(49.6, db, "lb")).toBe(55);
    expect(stepUp(185, getExercise("back-squat"), "lb")).toBe(190);
    expect(stepUp(185.2, getExercise("back-squat"), "lb")).toBe(190);
    expect(stepUp(0, getExercise("weighted-pull-up"), "lb")).toBe(2.5);
    expect(scaleLoad(200, 0.9, getExercise("back-squat"), "lb")).toBe(180);
    expect(scaleLoad(50, 0.9, db, "lb")).toBe(45);
  });
});

describe("load steps in kg", () => {
  it("dumbbells 2 kg (per hand), barbell and Smith 2.5 kg total, stacks 2.5 kg", () => {
    expect(loadStep(getExercise("incline-db-press"), "kg")).toBe(2);
    expect(loadStep(getExercise("db-lateral-raise"), "kg")).toBe(2);
    expect(loadStep(getExercise("walking-lunge"), "kg")).toBe(2);
    expect(loadStep(getExercise("back-squat"), "kg")).toBe(2.5);
    expect(loadStep(getExercise("romanian-deadlift"), "kg")).toBe(2.5);
    expect(loadStep(getExercise("lat-pulldown"), "kg")).toBe(2.5);
    expect(loadStep(getExercise("machine-chest-press"), "kg")).toBe(2.5);
    expect(loadStep(undefined, "kg")).toBe(2.5);
  });

  it("stepUp adds one step on the grid; scaleLoad lands on a step", () => {
    expect(displayLoad(stepUp(storeLoad(22.5, "kg"), getExercise("incline-db-press"), "kg"), "kg")).toBe(24.5);
    expect(displayLoad(stepUp(storeLoad(100, "kg"), getExercise("back-squat"), "kg"), "kg")).toBe(102.5);
    expect(displayLoad(scaleLoad(storeLoad(100, "kg"), 0.9, getExercise("back-squat"), "kg"), "kg")).toBe(90);
    expect(displayLoad(scaleLoad(storeLoad(22.5, "kg"), 0.9, getExercise("incline-db-press"), "kg"), "kg")).toBe(20);
  });

  it("plate maths in lb on a 45 lb bar with 45/35/25/10/5/2.5 plates", () => {
    expect(BAR.lb).toBe(45);
    expect(platesFor(225, "lb")).toEqual({ bar: 45, perSide: [45, 45], leftover: 0 });
    expect(platesFor(185, "lb")).toEqual({ bar: 45, perSide: [45, 25], leftover: 0 });
    expect(platesFor(140, "lb")).toEqual({ bar: 45, perSide: [45, 2.5], leftover: 0 });
    expect(platesFor(115, "lb")).toEqual({ bar: 45, perSide: [35], leftover: 0 });
    expect(platesFor(75, "lb")).toEqual({ bar: 45, perSide: [10, 5], leftover: 0 });
    expect(platesLabel(45, "lb")).toBe("Empty 45 lb bar");
    expect(platesLabel(135, "lb")).toBe("45 bar + 45 per side");
  });

  it("plate maths in kg on a 20 kg bar", () => {
    expect(BAR.kg).toBe(20);
    expect(platesFor(100, "kg")).toEqual({ bar: 20, perSide: [25, 15], leftover: 0 });
    expect(platesFor(62.5, "kg")).toEqual({ bar: 20, perSide: [20, 1.25], leftover: 0 });
    expect(platesLabel(20, "kg")).toBe("Empty 20 kg bar");
  });
});
