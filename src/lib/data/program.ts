"use client";

// The active training program and switching it (docs/PROGRAM-ARNOLD.md §2.3, §3.6). The
// program is written only by the database function set_training_program(), which changes the
// weekly schedule, prefs and future day plans in one transaction; this hook only calls it.

import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { activeProgram, programSince, PROGRAMS, type ProgramDef } from "@/lib/training/programs";
import type { ProgramId } from "@/lib/training/types";
import type { ISODate } from "@/lib/dates";
import { isOffline, must, sb, useToday, useUser } from "./core";
import { useProfile, useSavePrefs } from "./profile";
import { ensureProgramRows } from "./training";

export function useActiveProgram(): { program: ProgramId; def: ProgramDef; since: ISODate | null; loading: boolean } {
  const { profile, loading } = useProfile();
  const program = activeProgram(profile);
  return { program, def: PROGRAMS[program], since: programSince(profile?.prefs, program), loading };
}

/** What set_training_program() returns. */
export interface SwitchResult {
  changed: boolean;
  program?: ProgramId;
  from?: ProgramId;
  to?: ProgramId;
  at?: string;
  date?: ISODate;
  frozen?: number;
  mapped?: number;
  cleared?: number;
}

/** Switch programs (both ways) with Undo. Resolves true when the switch happened. */
export function useSetProgram(): { setProgram(next: ProgramId): Promise<boolean>; pending: boolean } {
  const qc = useQueryClient();
  const { userId } = useUser();
  const today = useToday();
  const { profile } = useProfile();
  const savePrefs = useSavePrefs({ quiet: true });
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const current = activeProgram(profile);

  const run = async (next: ProgramId, previous: ProgramId): Promise<boolean> => {
    if (next === previous || busy.current) return false;
    if (isOffline()) {
      toast.error("You're offline. The program didn't change.", { description: "Try again when you're back online." });
      return false;
    }
    busy.current = true;
    setPending(true);
    try {
      // the target program's rows first, so its days never show built-ins over his edits
      const present = must(await sb().from("program_templates").select("key")).map((r) => r.key);
      await ensureProgramRows(next, present);
      const { data, error } = await sb().rpc("set_training_program", { p_program: next, p_today: today });
      if (error) {
        if (error.code === "PGRST202") toast("Switching programs is available once this update is published.");
        else toast.error("Couldn't switch. Nothing changed.", { description: error.message });
        return false;
      }
      const r = (data ?? { changed: false }) as unknown as SwitchResult;
      for (const k of ["profile", "templates", "day-plans", "sessions"]) await qc.invalidateQueries({ queryKey: [k] });
      if (!r.changed) return false;
      // his own switch never brings up the one-time "your plan changed" notice (DESIGN-V3 CR-1)
      savePrefs.mutate({ switchNoticeSeenAt: r.at ?? new Date().toISOString() });
      toast.success(`${PROGRAMS[next].name} is your program`, {
        duration: 6000,
        action: { label: "Undo", onClick: () => void run(previous, next) },
      });
      return true;
    } catch (e) {
      toast.error("Couldn't switch. Nothing changed.", { description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      busy.current = false;
      setPending(false);
      if (userId) qc.invalidateQueries({ queryKey: ["profile", userId] });
    }
  };

  return { setProgram: (next) => run(next, current), pending };
}
