"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyArt } from "@/components/art/Motifs";
import { Button } from "@/components/ui/button";
import { Empty, ErrorNote, Skeleton } from "@/components/ui/misc";
import { useLiveSession } from "./data";
import { LiveWorkout } from "./LiveWorkout";
import { SessionSummary } from "./SessionSummary";
import { WorkoutStyles } from "./styles";

/** /workout/[id]: the live session, its summary once finished, or a clear dead end. */
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
        <Empty art={<EmptyArt kind="column" size={56} />} title="This workout doesn't exist" action={<Button asChild variant="secondary"><Link href="/training">Go to Training</Link></Button>}>
          It may have been deleted, or the link is from another account.
        </Empty>
      </Centered>
    );
  else if (q.data.session.status === "discarded")
    body = (
      <Centered>
        <Empty art={<EmptyArt kind="column" size={56} />} title="This workout was discarded" action={<Button asChild variant="secondary"><Link href="/">Back to Today</Link></Button>}>
          Its sets don&apos;t count toward history, records or volume.
        </Empty>
      </Centered>
    );
  else if (q.data.session.status === "done" && !editing) body = <SessionSummary data={q.data} onEdit={() => setEditing(true)} />;
  else body = <LiveWorkout key={editing ? "edit" : "live"} data={q.data} mode={q.data.session.status === "done" ? "edit" : "live"} onDoneEditing={() => setEditing(false)} />;

  return (
    <>
      <WorkoutStyles />
      {body}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto grid min-h-dvh max-w-[440px] place-items-center px-4">{children}</div>;
}

export function WorkoutSkeleton({ label }: { label?: string }) {
  return (
    <div className="min-h-dvh bg-bg" aria-busy="true" aria-label={label ?? "Loading workout"}>
      <div className="chrome sticky top-0 z-20 border-b border-line-hair" style={{ paddingTop: "var(--safe-top)" }}>
        <div className="mx-auto flex h-[52px] max-w-[1120px] items-center gap-3 px-3">
          <Skeleton className="size-9 rounded-[12px]" />
          <div className="flex flex-1 flex-col items-center gap-1.5">
            {label ? <p className="t-h2 text-[15px] text-fg-2">{label}</p> : <Skeleton className="h-4 w-24" />}
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-10 w-20 rounded-[12px]" />
        </div>
      </div>
      <div className="mx-auto max-w-[720px] space-y-3 px-3 pt-4">
        <Skeleton className="h-[56px] rounded-[16px]" />
        <div className="card-instrument space-y-3 p-3">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20 rounded-full" />
            <Skeleton className="h-7 w-16 rounded-full" />
            <Skeleton className="h-7 w-20 rounded-full" />
          </div>
          <Skeleton className="h-16 rounded-[12px]" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[52px] rounded-[10px]" />
          ))}
        </div>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[56px] rounded-[16px]" />
        ))}
      </div>
    </div>
  );
}
