"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useGoUp } from "./trail";

/**
 * An in-app back control ("< Meal plan"): a real link to the parent screen that goes back in
 * history when the parent is where this screen was opened from, so it never stacks a copy of
 * the parent on top (see useGoUp).
 */
export function BackLink({ href, onClick, ...rest }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const goUp = useGoUp(href);
  return (
    <Link
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        goUp(e);
      }}
    />
  );
}
