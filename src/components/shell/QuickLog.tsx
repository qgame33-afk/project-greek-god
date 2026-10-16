"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Droplets, Dumbbell, HeartPulse, NotebookPen, Scale, ScanLine } from "lucide-react";
import { WeightLogSheet } from "@/components/shared/WeightLogSheet";
import { Sheet } from "@/components/ui/sheet";
import { useToday } from "@/lib/data/core";
import { useWaterMutations } from "@/lib/data/nutrition";
import { useStartWorkout } from "@/lib/data/workout";
import { toast } from "sonner";

export function QuickLog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const today = useToday();
  const water = useWaterMutations(today);
  const { startToday, starting } = useStartWorkout();
  const [weightOpen, setWeightOpen] = useState(false);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange} title="Quick log">
        <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
          <Tile
            icon={<Dumbbell className="size-6" />}
            label={starting ? "Starting…" : "Start workout"}
            onClick={async () => {
              const ok = await startToday();
              if (ok) onOpenChange(false);
            }}
          />
          <Tile
            icon={<Scale className="size-6" />}
            label="Log weight"
            onClick={() => {
              onOpenChange(false);
              setWeightOpen(true);
            }}
          />
          <Tile icon={<ScanLine className="size-6" />} label="Scan meal" onClick={() => go("/nutrition/scan")} />
          <Tile icon={<NotebookPen className="size-6" />} label="Log food" onClick={() => go("/nutrition?add=1")} />
          <div className="card-inset flex h-24 flex-col justify-between p-3">
            <span className="flex items-center gap-2 text-[13px] font-bold text-fg">
              <Droplets className="size-5 text-lapis" /> Water
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {[250, 500].map((ml) => (
                <button
                  key={ml}
                  type="button"
                  onClick={() => {
                    const id = water.addMl(ml);
                    toast.success(`+${ml} mL water`, { duration: 6000, action: { label: "Undo", onClick: () => water.remove.mutate(id) } });
                  }}
                  className="press num h-9 rounded-[10px] bg-s4 text-[15px] font-semibold text-fg"
                >
                  +{ml}
                </button>
              ))}
            </div>
          </div>
          <Tile icon={<HeartPulse className="size-6" />} label="Check-in" onClick={() => go("/recovery?checkin=1")} />
        </div>
      </Sheet>
      <WeightLogSheet open={weightOpen} onOpenChange={setWeightOpen} />
    </>
  );
}

function Tile({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="card-inset press flex h-24 flex-col justify-between p-3 text-left hover:bg-s4">
      <span className="text-gold-300">{icon}</span>
      <span className="text-[14px] font-bold text-fg">{label}</span>
    </button>
  );
}
