"use client";

import { ImageIcon, Trash } from "lucide-react";
import { useRef, useState } from "react";
import { AiChip } from "@/components/ui/ai-chip";
import { ListGroup, Row } from "@/components/ui/list";
import { Skeleton } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { useSignedUrls } from "@/lib/data/body";
import { useDeleteFood, type FoodEntry } from "@/lib/data/nutrition";
import { formatInt } from "@/lib/units";
import { groupTitle, isAiEntry } from "./DayList";

/**
 * One folded meal (a photo scan, a coach meal, a saved meal): its items (tap one to edit it), the
 * private photo it was saved with, and "Remove all" with Undo.
 */
export function GroupSheet({ entries, open, onOpenChange, onEdit }: { entries: FoodEntry[]; open: boolean; onOpenChange: (o: boolean) => void; onEdit: (e: FoodEntry) => void }) {
  const del = useDeleteFood();
  const removing = useRef(false);
  const src = entries[0]?.source ?? "";
  const title = groupTitle(src);
  const ai = entries.some(isAiEntry);
  const photo = entries.find((e) => e.photo_path)?.photo_path ?? null;
  const kcal = entries.reduce((a, e) => a + Number(e.calories ?? 0), 0);
  const removeAll = () => {
    if (removing.current || !entries.length) return;
    removing.current = true;
    onOpenChange(false);
    del
      .mutateAsync({ ids: entries.map((e) => e.id), date: entries[0].local_date, rows: entries, label: `${title} removed · ${entries.length} items` })
      .catch(() => {})
      .finally(() => (removing.current = false));
  };
  return (
    <Sheet open={open && entries.length > 0} onOpenChange={onOpenChange} title={title} description={`${entries.length} items · ${formatInt(kcal)} kcal`}>
      <div className="flex flex-col gap-4 pb-2">
        {ai && <AiChip label="AI" status="Saved" />}
        <ListGroup ariaLabel="Items">
          {entries.map((e) => (
            <Row
              key={e.id}
              title={e.name}
              subtitle={`${formatInt(Number(e.calories))} kcal · ${Math.round(Number(e.protein_g))} g protein`}
              onClick={() => {
                onOpenChange(false);
                onEdit(e);
              }}
              ariaLabel={`${e.name}, ${formatInt(Number(e.calories))} calories. Edit`}
              dataName
            />
          ))}
        </ListGroup>
        <ListGroup>
          {photo && <PhotoRow path={photo} />}
          <Row icon={Trash} title="Remove all" danger onClick={removeAll} chevron={false} ariaLabel={`Remove all ${entries.length} items`} />
        </ListGroup>
      </div>
    </Sheet>
  );
}

/** The private photo a scanned meal was saved with: tap to see it. */
function PhotoRow({ path }: { path: string }) {
  const urls = useSignedUrls("meal-photos", [path]);
  const url = urls.data?.[path];
  const [show, setShow] = useState(false);
  return (
    <>
      <Row icon={ImageIcon} title="Photo" subtitle="Saved privately. Only you can see it." onClick={() => setShow((s) => !s)} chevron={false} />
      {show && (
        <div className="px-4 pb-4">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private photo
            <img src={url} alt="Photo of this meal" className="max-h-[60dvh] w-full rounded-tile-lg object-contain" />
          ) : urls.isError ? (
            <p className="t-label py-6 text-center">The photo couldn&apos;t be loaded.</p>
          ) : (
            <Skeleton className="aspect-[4/3] w-full rounded-tile-lg" />
          )}
        </div>
      )}
    </>
  );
}
