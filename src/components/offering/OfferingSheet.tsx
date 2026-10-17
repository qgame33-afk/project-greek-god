"use client";

// SEED (Foundation → Sheets at the F-B hand-off). The Offering sheet's Log mode, carrying the old
// QuickLog actions in the Olympus look until the Sheets stream builds Ask & Log (docs/DESIGN-V2.md
// §3.9): the natural-language field, "Suggested now", the EstimateCard and the Ask mode.

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronRight, ScanLine, Search, Weight } from "lucide-react";
import { toast } from "sonner";
import { OracleSparkles, SealTick, TrainColumn } from "@/components/art/icons";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useWaterMutations } from "@/lib/data/nutrition";
import { useActiveSession } from "@/lib/data/training";
import { useStartWorkout } from "@/lib/data/workout";

export function OfferingSheet({ open, onOpenChange, onAsk }: { open: boolean; onOpenChange: (o: boolean) => void; onAsk: () => void }) {
  const router = useRouter();
  const today = useToday();
  const water = useWaterMutations(today);
  const active = useActiveSession().data;
  const { startToday, starting } = useStartWorkout();
  const [weightOpen, setWeightOpen] = useState(false);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Log or ask" description="Log something now, or ask the Oracle.">
        <div className="grid grid-cols-2 gap-2.5 pb-1 pt-2 sm:grid-cols-3">
          <Tile
            icon={<TrainColumn className="size-6" />}
            label={active ? `Return to ${active.name}` : starting ? "Starting…" : "Start workout"}
            onClick={async () => {
              if (active) return go(`/workout/${active.id}`);
              const ok = await startToday();
              if (ok) onOpenChange(false);
            }}
          />
          <Tile
            icon={<Weight className="size-6" strokeWidth={1.6} />}
            label="Weigh-in"
            onClick={() => {
              onOpenChange(false);
              setWeightOpen(true);
            }}
          />
          <Tile icon={<ScanLine className="size-6" strokeWidth={1.6} />} label="Scan a meal" onClick={() => go("/nutrition/scan")} />
          <Tile icon={<Search className="size-6" strokeWidth={1.6} />} label="Search food" onClick={() => go("/nutrition?add=1")} />
          <div className="flex min-h-[88px] flex-col justify-between rounded-btn bg-m2 p-3 shadow-[inset_0_0_0_1px_var(--vein-2)]">
            <span className="t-title-3 text-ivory">Water</span>
            <div className="grid grid-cols-2 gap-1.5">
              {[250, 500].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  aria-label={`Add ${ml} millilitres of water`}
                  onClick={() => {
                    const id = water.addMl(ml);
                    toast.success(`+${ml} mL water`, { duration: 6000, action: { label: "Undo", onClick: () => water.remove.mutate(id) } });
                  }}
                  className="press tnum h-11 rounded-field bg-m3 text-[length:max(15px,0.9375rem)] font-semibold text-ivory shadow-[inset_0_0_0_1px_var(--vein-2)] active:bg-m4"
                >
                  +{ml}
                </button>
              ))}
            </div>
          </div>
          <Tile icon={<SealTick className="size-6" />} label="Check-in" onClick={() => go("/recovery?checkin=1")} />
        </div>
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onAsk();
          }}
          className="press-soft mb-1 mt-3 flex min-h-14 w-full items-center gap-3 rounded-btn border border-aegean-line bg-aegean-tint px-4 text-left"
        >
          <OracleSparkles className="size-5 text-aegean" />
          <span className="t-title-3 flex-1 text-ivory">Ask the Oracle</span>
          <ChevronRight className="size-4 text-ash" strokeWidth={1.6} aria-hidden />
        </button>
      </Sheet>
      <WeightLogSheet open={weightOpen} onOpenChange={setWeightOpen} />
    </>
  );
}

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex min-h-[88px] flex-col justify-between rounded-btn bg-m2 p-3 text-left shadow-[inset_0_0_0_1px_var(--vein-2)] hover:bg-m3 active:bg-m3"
    >
      <span className="text-ivory">{icon}</span>
      <span className="t-title-3 text-ivory">{label}</span>
    </button>
  );
}
