"use client";

import { useEffect, useLayoutEffect, useRef, type KeyboardEvent } from "react";

/**
 * Hold-to-repeat for ± buttons and the keyboard behaviour of an adjustable number (`spinbutton`):
 * a press steps once, holding repeats after 400 ms every 120 ms; arrow keys step; Enter or Space
 * opens the keypad when there is one. Shared by NumberCard and BigValue.
 */
export function useStepper({
  value,
  onChange,
  step,
  min,
  max,
  onKeypad,
}: {
  value: number;
  onChange: (v: number) => void;
  step: number;
  min: number;
  max: number;
  onKeypad?: () => void;
}) {
  const valueRef = useRef(value);
  useLayoutEffect(() => {
    valueRef.current = value;
  });
  const timer = useRef<number | null>(null);
  const decimals = Math.max(0, (String(step).split(".")[1] ?? "").length);
  const clamp = (v: number) => Math.min(max, Math.max(min, Number((Math.round(v / step) * step).toFixed(decimals))));
  const bump = (dir: 1 | -1) => {
    const next = clamp(valueRef.current + dir * step);
    if (next === valueRef.current) return;
    valueRef.current = next;
    onChange(next);
  };
  const stop = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const hold = (dir: 1 | -1) => ({
    onPointerDown: (e: { preventDefault: () => void; button: number }) => {
      if (e.button !== 0) return;
      e.preventDefault();
      bump(dir);
      const repeat = () => {
        bump(dir);
        timer.current = window.setTimeout(repeat, 120);
      };
      timer.current = window.setTimeout(repeat, 400);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bump(dir);
      }
    },
  });
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      bump(1);
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      bump(-1);
    } else if ((e.key === "Enter" || e.key === " ") && onKeypad) {
      e.preventDefault();
      onKeypad();
    }
  };
  return { bump, hold, onKeyDown, atMin: value <= min, atMax: value >= max };
}
