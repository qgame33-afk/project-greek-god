"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useLiveSession } from "./data";
import { LiveWorkout } from "./LiveWorkout";
import { ToastsBelowTopBar, WorkoutStyles } from "./styles";
import { Summary } from "./Summary";

/** /workout/[id]: the live workout, "Workout done" once finished, or a clear dead end (§4.2.13). */
export function WorkoutScreen({ id }: { id: string }) {
  const q = useLiveSession(id);
  const [editing, setEditing] = useState(false);

  let body;
  if (q.isPending && !q.isError) body = <WorkoutSkeleton />; // includes waiting for the signed-in user
  else if (q.isError)
    body = (
      <Centered>
        <h1 className="sr-only">Workout</h1>
        <ErrorNote onRetry={() => q.refetch()}>Couldn&apos;t load this workout.</ErrorNote>
      </Centered>
    );
  else if (!q.data) body = <DeadEnd title="This workout doesn't exist" />;
  else if (q.data.session.status === "discarded") body = <DeadEnd title="This workout was discarded" />;
  else if (q.data.session.status === "done" && !editing) body = <Summary data={q.data} onEdit={() => setEditing(true)} />;
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
  return <div className="mx-auto grid min-h-dvh max-w-col place-items-center bg-bg px-5">{children}</div>;
}

function DeadEnd({ title }: { title: string }) {
  return (
    <Centered>
      <div className="w-full">
        <h1 className="sr-only">{title}</h1>
        <Empty
          title={title}
          action={
            <Button asChild variant="secondary" size="lg">
              <Link href="/training">Back to Train</Link>
            </Button>
          }
        />
      </div>
    </Centered>
  );
}

/** The workout's layout in outline while it loads (no spinner): the top bar, the lift, the dock. */
export function WorkoutSkeleton({ label }: { label?: string }) {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true">
      <div className="mx-auto max-w-col px-4" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="flex min-h-14 items-center gap-2">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-1 flex-col items-center gap-1.5">
            <Skeleton className="h-4 w-32 rounded-pill" />
            <Skeleton className="h-3 w-20 rounded-pill" />
          </div>
          <Skeleton className="h-11 w-20 rounded-pill" />
        </div>
        <Skeleton className="mt-1.5 h-1 rounded-full" />
        {label ? <h1 className="t-head mt-6 line-clamp-2 text-fg">{label}</h1> : <h1 className="sr-only">Loading workout</h1>}
        {!label && <Skeleton className="mt-6 h-9 w-3/4 rounded-tile" />}
        <Skeleton className="mt-4 h-5 w-2/3 rounded-pill" />
        <Skeleton className="mt-3 h-4 w-1/2 rounded-pill" />
      </div>
      <div className="fixed inset-x-0 bottom-0 bg-bg px-4" style={{ paddingBottom: "calc(var(--safe-bottom) + 12px)" }}>
        <div className="mx-auto max-w-col space-y-2.5">
          <Skeleton className="h-[140px] rounded-card short:h-[110px]" />
          <Skeleton className="h-[140px] rounded-card short:h-[110px]" />
          <Skeleton className="h-16 rounded-pill" />
        </div>
      </div>
    </div>
  );
}
