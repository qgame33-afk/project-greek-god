"use client";

import Link from "next/link";
import { useState } from "react";
import { TrainColumn } from "@/components/art/icons";
import { Button } from "@/components/ui/button";
import { ErrorNote, Skeleton } from "@/components/ui/misc";
import { useLiveSession } from "./data";
import { Inscription } from "./inscription/Inscription";
import { LiveWorkout } from "./LiveWorkout";
import { ToastsBelowTopBar, WorkoutStyles } from "./styles";

/** /workout/[id]: Gym Mode for a live session, the Inscription once sealed, or a clear dead end. */
export function WorkoutScreen({ id }: { id: string }) {
  const q = useLiveSession(id);
  const [editing, setEditing] = useState(false);

  let body;
  if (q.isPending && !q.isError) body = <WorkoutSkeleton />; // includes waiting for the signed-in user
  else if (q.isError)
    body = (
      <Centered>
        <ErrorNote onRetry={() => q.refetch()}>Couldn&apos;t load this workout. {q.error instanceof Error ? q.error.message : ""}</ErrorNote>
      </Centered>
    );
  else if (!q.data)
    body = (
      <Centered>
        <DeadEnd title="This workout doesn't exist" href="/training" action="Go to Train">
          It may have been deleted, or the link is from another account.
        </DeadEnd>
      </Centered>
    );
  else if (q.data.session.status === "discarded")
    body = (
      <Centered>
        <DeadEnd title="This workout was discarded" href="/" action="Back to Now">
          Its sets don&apos;t count toward history, records or volume.
        </DeadEnd>
      </Centered>
    );
  else if (q.data.session.status === "done" && !editing) body = <Inscription data={q.data} onEdit={() => setEditing(true)} />;
  else body = <LiveWorkout key={editing ? "edit" : "live"} data={q.data} mode={q.data.session.status === "done" ? "edit" : "live"} onDoneEditing={() => setEditing(false)} />;

  return (
    <>
      <WorkoutStyles />
      <ToastsBelowTopBar />
      {body}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid min-h-dvh max-w-col place-items-center bg-obsidian px-5">{children}</div>;
}

function DeadEnd({ title, href, action, children }: { title: string; href: string; action: string; children: React.ReactNode }) {
  return (
    <div className="text-center">
      <TrainColumn aria-hidden className="mx-auto size-12 text-ash" strokeWidth={1.2} />
      <h1 className="t-title-2 mt-5 text-ivory">{title}</h1>
      <p className="t-callout mx-auto mt-2 max-w-[18rem] text-stone">{children}</p>
      <Button asChild variant="secondary" size="lg" className="mt-6">
        <Link href={href}>{action}</Link>
      </Button>
    </div>
  );
}

/** The Gym Mode layout in outline while the session loads (no spinner on first paint). */
export function WorkoutSkeleton({ label }: { label?: string }) {
  return (
    <div data-mode="gym" className="min-h-dvh bg-obsidian" aria-busy="true" aria-label={label ?? "Loading workout"}>
      <div className="mx-auto max-w-col px-3" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex h-(--topbar-h) items-center gap-2">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-1 flex-col items-center gap-1.5">
            {label ? <p className="t-eyebrow !text-ivory [letter-spacing:.2em]">{label}</p> : <Skeleton className="h-3 w-16" />}
            <Skeleton className="h-3.5 w-10" />
          </div>
          <Skeleton className="h-11 w-20 rounded-full" />
        </div>
        <Skeleton className="mx-1 mt-1 h-1 rounded-full" />
      </div>
      <div className="mx-auto max-w-col space-y-3 px-4 pt-8">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="mx-auto !mt-8 aspect-[200/112] w-full max-w-[300px] rounded-t-full" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-btn" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[76px] rounded-btn" />
          ))}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 rounded-t-sheet bg-m1 px-3 pt-3" style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}>
        <div className="mx-auto max-w-col space-y-2">
          <div className="grid grid-cols-[1.42fr_1fr] gap-2">
            <Skeleton className="h-16 rounded-btn" />
            <Skeleton className="h-16 rounded-btn" />
          </div>
          <Skeleton className="h-16 rounded-btn" />
        </div>
      </div>
    </div>
  );
}
