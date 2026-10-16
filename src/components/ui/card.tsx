import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

type Variant = "card" | "monument" | "instrument" | "inset" | "accent";

const VARIANT: Record<Variant, string> = {
  card: "card p-4 sm:p-5 lg:p-6",
  monument: "card-monument p-5 sm:p-6 lg:p-7",
  instrument: "card-instrument p-4 sm:p-5",
  inset: "card-inset p-3",
  accent: "card-accent p-4 sm:p-5 lg:p-6",
};

export function Card({ variant = "card", className, ...props }: ComponentProps<"section"> & { variant?: Variant }) {
  return <section className={cn(VARIANT[variant], className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  className,
  gold,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
  gold?: boolean;
}) {
  return (
    <div className={cn("mb-3 flex min-h-6 items-center justify-between gap-3", className)}>
      <h2 className={cn("eyebrow", gold && "text-gold-400")}>{title}</h2>
      {action}
    </div>
  );
}

/** Text action for card headers: gold, 44px hit area. */
export function CardAction({ href, onClick, children }: { href?: string; onClick?: () => void; children: ReactNode }) {
  const cls = "press -my-3 -mr-2 inline-flex h-11 items-center rounded-[10px] px-2 text-[13px] font-bold text-gold-300 hover:text-gold-200";
  if (href)
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function LinkCard({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("card press-soft group flex items-center gap-3 p-4 hover:border-line-strong", className)}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight className="size-4 shrink-0 text-fg-3 transition-[translate] duration-(--dur-fast) group-hover:translate-x-0.5" />
    </Link>
  );
}
