"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, ChevronDown, Share, Smartphone, SquarePlus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { cn } from "@/lib/cn";
import { useProfile, useSaveProfile } from "@/lib/data/profile";
import type { Json } from "@/lib/supabase/database.types";
import { REMINDER_META, normalizeSettings, overflowKinds, type ReminderKind, type ReminderSettings as Settings } from "@/lib/reminders/schedule";
import { currentSubscription, detectPush, disablePush, enablePush, isIOS, saveSubscription, sendTest, type PushSupport } from "./push";

const ORDER: ReminderKind[] = ["workout", "food", "hydration", "sleep", "weighin", "photos", "review"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const listOf = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

const rowBase =
  "relative flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5 text-left [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-4 [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-line-hair";
const groupCls = "overflow-hidden rounded-[20px] border border-line bg-s1 shadow-[var(--e1)]";

interface Status {
  pushConfigured: boolean;
  devices: number;
  scheduler: { state: "active" | "not_scheduled" | "unavailable" | "unknown"; url: string | null; lastRunAt: string | null };
}

type SaveProfile = ReturnType<typeof useSaveProfile>["mutate"];

/**
 * The reminder settings as the user sees them, plus `update`. Every reminder lives in one
 * jsonb (profile.reminders), so quick taps must not race: changes are applied to a local
 * draft at once, coalesced for 350 ms, and written one at a time, each write carrying
 * every change made so far. The draft wins over the cached profile until its last write
 * settles, so a refetch that lands mid-way can't flip a switch back.
 */
function useReminderDraft(stored: unknown, mutate: SaveProfile) {
  const [draft, setDraft] = useState<Settings | null>(null);
  const draftRef = useRef<Settings | null>(null);
  const timer = useRef<number | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  const flush = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const next = draftRef.current;
    if (!next) return;
    if (inFlight.current) {
      again.current = true; // write again once the current one settles
      return;
    }
    inFlight.current = true;
    mutate(
      { values: { reminders: next as unknown as NonNullable<Json> } },
      {
        onError: () => {
          // useSaveProfile rolled the cache back and said so; drop the draft with it
          draftRef.current = null;
          again.current = false;
          setDraft(null);
        },
        onSettled: () => {
          inFlight.current = false;
          if (again.current) {
            again.current = false;
            flushRef.current();
          } else if (draftRef.current === next) {
            draftRef.current = null;
            setDraft(null);
          }
        },
      },
    );
  }, [mutate]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  // leaving the page doesn't drop a change still waiting to be written
  useEffect(() => () => flush(), [flush]);

  const value = draft ?? normalizeSettings(stored);
  const update = useCallback(
    (kind: ReminderKind, patch: Partial<Settings[ReminderKind]>) => {
      const base = draftRef.current ?? normalizeSettings(stored);
      const next = { ...base, [kind]: { ...base[kind], ...patch } } as Settings;
      draftRef.current = next;
      setDraft(next);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, 350);
    },
    [stored, flush],
  );
  return { value, update };
}

/**
 * Settings → Reminders (SPEC §20). Per-reminder switches and times stored in
 * profile.reminders, this device's push opt-in, a test send, and an honest line about
 * what delivery needs. Renders its own "Reminders" groups; pass `embedded` to get only
 * the rows (for a parent that already draws the group container).
 */
export function ReminderSettings({ embedded = false }: { embedded?: boolean } = {}) {
  const { profile, loading } = useProfile();
  const save = useSaveProfile();
  const settings = useReminderDraft(profile?.reminders, save.mutate);
  const status = useQuery({
    queryKey: ["reminders-status"],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch("/api/reminders/status");
      if (!r.ok) throw new Error("status unavailable");
      return (await r.json()) as Status;
    },
  });
  const update = settings.update;

  const deviceTz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : null;
  // the iPhone note shows everywhere except on an iPhone, where the device row above
  // already gives the exact state (Home Screen steps, iOS version, or working)
  const [onIPhone] = useState(() => typeof window !== "undefined" && isIOS());
  const tzMismatch = !!profile && !!deviceTz && profile.timezone !== deviceTz;
  const anyEnabled = ORDER.some((k) => settings.value[k].on);

  const device = <DeviceRows status={status.data} onDevicesChange={() => status.refetch()} anyEnabled={anyEnabled} />;
  const rows = loading ? (
    <SkeletonRows />
  ) : (
    ORDER.map((k) => <ReminderRow key={k} kind={k} settings={settings.value} onChange={(patch) => update(k, patch)} />)
  );
  const overflow = overflowKinds(settings.value);
  const footnote = (
    <div className="space-y-1.5 text-[12px] leading-relaxed font-medium text-fg-3">
      <p>
        At most 3 a day, and each one is skipped when the task is already done.
        {overflow.length > 0 && (
          <span className="text-fg-2">
            {" "}
            On days with more than 3, the least important {overflow.length === 1 ? "is" : "are"} skipped: {listOf(overflow.map((k) => REMINDER_META[k].label))}.
          </span>
        )}
      </p>
      {profile && (
        <p>
          Times are in {profile.timezone.replace(/_/g, " ")}.
          {tzMismatch && (
            <>
              {" "}
              This device is on {deviceTz!.replace(/_/g, " ")}.{" "}
              <button
                type="button"
                className="-my-3 inline-flex min-h-11 items-center font-bold text-gold-300 hover:text-gold-200 sm:my-0 sm:min-h-0"
                onClick={() => save.mutate({ values: { timezone: deviceTz! } }, { onSuccess: () => toast("Time zone updated", { description: deviceTz! }) })}
                disabled={save.isPending}
              >
                Use this time zone
              </button>
            </>
          )}
        </p>
      )}
      {!onIPhone && <p>On iPhone, reminders need iOS 16.4 or later and the app opened from the Home Screen: in Safari, tap Share, then Add to Home Screen.</p>}
      <SchedulerLine status={status.data} loading={status.isLoading} />
    </div>
  );

  if (embedded) {
    return (
      <>
        {device}
        {rows}
        <div className={cn(rowBase, "block py-3.5")}>{footnote}</div>
      </>
    );
  }

  return (
    <section id="reminders" className="scroll-mt-20 lg:scroll-mt-8" aria-labelledby="reminders-title">
      <div className="mb-2 flex min-h-5 items-end justify-between px-1">
        <h2 id="reminders-title" className="eyebrow">
          Reminders
        </h2>
      </div>
      <div className={groupCls}>{device}</div>
      <div className={cn(groupCls, "mt-3")}>{rows}</div>
      <div className="mt-2 px-1">{footnote}</div>
    </section>
  );
}

/* ------------------------------------------------------------- this device */

type DeviceState =
  | { kind: "checking" }
  | { kind: "unsupported"; support: Extract<PushSupport, { ok: false }> }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on" };

function DeviceRows({ status, onDevicesChange, anyEnabled }: { status: Status | undefined; onDevicesChange: () => void; anyEnabled: boolean }) {
  const qc = useQueryClient();
  const [state, setState] = useState<DeviceState>({ kind: "checking" });
  const [busy, setBusy] = useState<null | "enable" | "disable" | "test">(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = detectPush();
      if (!support.ok) return alive && setState({ kind: "unsupported", support });
      if (Notification.permission === "denied") return alive && setState({ kind: "denied" });
      try {
        const sub = Notification.permission === "granted" ? await currentSubscription() : null;
        if (!alive) return;
        if (sub) {
          setState({ kind: "on" });
          // keep the server's copy current (e.g. after switching accounts on this device)
          saveSubscription(sub).then(onDevicesChange, () => {});
        } else setState({ kind: "off" });
      } catch {
        if (alive) setState({ kind: "off" });
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount
  }, []);

  const run = async (what: "enable" | "disable" | "test") => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(what);
    setError(null);
    try {
      if (what === "enable") {
        await enablePush();
        setState({ kind: "on" });
        toast("Reminders are on for this device", { description: anyEnabled ? "Send a test to see how they look." : "Now choose which reminders you want below." });
      } else if (what === "disable") {
        await disablePush();
        setState({ kind: "off" });
        toast("Reminders are off for this device");
      } else {
        await sendTest();
        toast("Test sent", { description: "It should arrive within a few seconds." });
      }
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "denied") setState({ kind: "denied" });
      else if (code === "no_device" || code === "expired") setState({ kind: "off" });
      setError((e as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["reminders-status"] });
    }
  };

  const devices = status?.devices ?? 0;

  if (state.kind === "checking") {
    return (
      <div className={rowBase} aria-busy>
        <span className="skeleton size-9 rounded-[10px]" />
        <span className="flex-1">
          <span className="skeleton block h-3.5 w-40 rounded-full" />
          <span className="skeleton mt-2 block h-3 w-56 rounded-full" />
        </span>
      </div>
    );
  }

  if (state.kind === "unsupported") {
    const r = state.support.reason;
    if (r === "ios-install") {
      return (
        <div className={cn(rowBase, "items-start py-4")}>
          <Glyph tone="muted">
            <Smartphone className="size-[18px]" />
          </Glyph>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-fg">Add to Home Screen first</p>
            <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-fg-3">On iPhone, Safari only delivers notifications to web apps opened from the Home Screen (iOS 16.4 or later).</p>
            <ol className="mt-3 space-y-2 text-[13px] font-medium text-fg-2">
              <Step n={1}>
                Tap <Share className="mx-0.5 inline size-4 -translate-y-px text-fg" aria-label="Share" /> Share in Safari&apos;s toolbar.
              </Step>
              <Step n={2}>
                Choose <SquarePlus className="mx-0.5 inline size-4 -translate-y-px text-fg" aria-hidden /> Add to Home Screen.
              </Step>
              <Step n={3}>Open Greek God from your Home Screen and come back here to turn reminders on.</Step>
            </ol>
          </div>
        </div>
      );
    }
    const text =
      r === "ios-old"
        ? { t: "Needs iOS 16.4 or later", d: "Update iOS, then open the app from your Home Screen to enable reminders." }
        : r === "insecure"
          ? { t: "Needs a secure connection", d: "Notifications only work when the app is served over HTTPS." }
          : { t: "This browser can't receive notifications", d: "Use Safari on iPhone from the Home Screen, or a current Chrome, Edge, Firefox or Safari." };
    return (
      <div className={rowBase}>
        <Glyph tone="muted">
          <BellOff className="size-[18px]" />
        </Glyph>
        <Labels label={text.t} detail={text.d} />
      </div>
    );
  }

  if (state.kind === "denied") {
    return (
      <div className={cn(rowBase, "items-start py-3.5")}>
        <Glyph tone="muted">
          <BellOff className="size-[18px]" />
        </Glyph>
        <Labels
          label="Notifications are blocked"
          detail="Allow them in iPhone Settings → Notifications → Greek God, or in this browser's site settings, then reload this page."
        />
      </div>
    );
  }

  return (
    <>
      <div className={cn(rowBase, "flex-wrap py-3.5 sm:flex-nowrap")}>
        <Glyph tone={state.kind === "on" ? "gold" : "muted"}>{state.kind === "on" ? <BellRing className="size-[18px]" /> : <Bell className="size-[18px]" />}</Glyph>
        <Labels
          label={state.kind === "on" ? "On for this device" : "Off on this device"}
          detail={
            state.kind === "on"
              ? `${devices > 1 ? `${devices} devices receive reminders.` : "This device receives reminders."}${anyEnabled ? "" : " Choose which ones below."}`
              : status && !status.pushConfigured
                ? "The server isn't set up for push yet."
                : "Allow notifications so the reminders below can reach this device."
          }
        />
        <div className="flex w-full justify-end gap-2 pl-12 sm:w-auto sm:pl-0">
          {state.kind === "on" ? (
            <>
              <Button size="sm" variant="secondary" className="h-11 sm:h-9" onClick={() => run("test")} loading={busy === "test"} disabled={!!busy}>
                Send test
              </Button>
              <Button size="sm" variant="ghost" className="h-11 sm:h-9" onClick={() => run("disable")} loading={busy === "disable"} disabled={!!busy}>
                Turn off
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline-gold" className="h-11 sm:h-9" onClick={() => run("enable")} loading={busy === "enable"} disabled={!!busy || (status ? !status.pushConfigured : false)}>
              Enable on this device
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className={cn(rowBase, "py-3")} role="alert">
          <p className="text-[13px] font-medium leading-snug text-danger">{error}</p>
        </div>
      )}
    </>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="num-xs grid size-5 shrink-0 place-items-center rounded-full bg-s3 text-[12px] text-fg-2">{n}</span>
      <span className="leading-snug">{children}</span>
    </li>
  );
}

function Glyph({ children, tone }: { children: ReactNode; tone: "gold" | "muted" }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", tone === "gold" ? "bg-gold-tint text-gold-300" : "bg-s3 text-fg-2")} aria-hidden>
      {children}
    </span>
  );
}

function Labels({ label, detail }: { label: ReactNode; detail?: ReactNode }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-semibold leading-snug text-fg">{label}</span>
      {detail && <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-fg-3">{detail}</span>}
    </span>
  );
}

/* ------------------------------------------------------------ reminder row */

function ReminderRow({ kind, settings, onChange }: { kind: ReminderKind; settings: Settings; onChange: (patch: Record<string, unknown>) => void }) {
  const meta = REMINDER_META[kind];
  const r = settings[kind];
  const id = `rem-${kind}`;
  return (
    <div className={cn(rowBase, "flex-col items-stretch gap-0 py-0")}>
      <div
        className="flex min-h-[60px] cursor-pointer items-center gap-3 py-2.5"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          onChange({ on: !r.on });
        }}
      >
        <Labels label={meta.label} detail={meta.caption} />
        <Switch id={id} checked={r.on} onCheckedChange={(on) => onChange({ on })} label={meta.label} />
      </div>
      {r.on && (
        <div className="-mt-1 flex flex-wrap items-center gap-2 pb-3.5">
          {kind === "weighin" && (
            <SelectPill label="Day of the week" value={String(settings.weighin.day)} onChange={(v) => onChange({ day: Number(v) })}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}s
                </option>
              ))}
            </SelectPill>
          )}
          {kind === "photos" && (
            <SelectPill label="Day of the month" value={String(settings.photos.day)} onChange={(v) => onChange({ day: Number(v) })}>
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)} of the month
                </option>
              ))}
            </SelectPill>
          )}
          {kind === "review" && <span className="text-[13px] font-semibold text-fg-2">1st of each month at</span>}
          <TimeField label={`${meta.label} time`} value={r.time} onCommit={(time) => onChange({ time })} />
        </div>
      )}
    </div>
  );
}

const pillCls =
  "h-11 rounded-[10px] border border-line-field bg-s3 px-3 text-[16px] font-semibold text-fg outline-none transition-[border-color,box-shadow] focus:border-gold-400 focus:shadow-[0_0_0_3px_rgb(213_172_103/.18)] [color-scheme:dark]";

function SelectPill({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode }) {
  return (
    <span className="relative inline-flex">
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(pillCls, "appearance-none pr-9")}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
    </span>
  );
}

/** Local draft that commits after typing settles (or on blur), so the profile isn't written per keystroke. */
function TimeField({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  // a saved value from elsewhere (another device, a rollback) replaces the draft
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const timer = useRef<number | null>(null);
  const commit = (v: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(v) && v !== value) onCommit(v);
  };
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <input
      type="time"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => commit(v), 700);
      }}
      onBlur={() => commit(draft)}
      className={cn(pillCls, "num w-[124px] text-center tabular-nums")}
    />
  );
}

function SkeletonRows() {
  return (
    <>
      {ORDER.map((k, i) => (
        <div key={k} className={cn("flex h-[60px] items-center justify-between px-4", i > 0 && "border-t border-line-hair")} aria-hidden>
          <span>
            <span className="skeleton block h-3.5 w-36 rounded-full" />
            <span className="skeleton mt-2 block h-3 w-52 rounded-full" />
          </span>
          <span className="skeleton h-[31px] w-[51px] rounded-full" />
        </div>
      ))}
    </>
  );
}

/* ------------------------------------------------------------ status line */

/** Wall-clock "now" that refreshes each minute (kept out of render for purity). */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function ago(iso: string, now: number) {
  const min = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function SchedulerLine({ status, loading }: { status: Status | undefined; loading: boolean }) {
  const now = useNow();
  if (loading) return null;
  const s = status?.scheduler;
  if (status && !status.pushConfigured) {
    return <p>Push isn&apos;t configured on this server yet (it needs the Supabase service role key). Settings still save.</p>;
  }
  if (s?.state === "active") {
    const stale = s.lastRunAt && now - new Date(s.lastRunAt).getTime() > 45 * 60_000;
    return (
      <p>
        Delivered by a schedule that checks every 15 minutes
        {s.lastRunAt ? <>. Last check {ago(s.lastRunAt, now)}{stale ? ", so the schedule may be paused" : ""}.</> : ". It hasn't run yet."}
      </p>
    );
  }
  return <p>Reminders are delivered by a schedule that runs every 15 minutes once the app is deployed with the database scheduler enabled.</p>;
}
