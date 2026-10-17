"use client";

import { Segmented } from "@/components/ui/controls";
import { saveAppearance, useAppearance, type MotionPref, type NightPref } from "@/lib/appearance";
import { useSavePrefs, type Profile } from "@/lib/data/profile";
import { parseAppPrefs } from "@/lib/prefs";
import { ControlRow, Group, SwitchRow } from "./List";

/**
 * Settings → Appearance (docs/DESIGN-V2.md §3.10, §1.1.4): Motion, Reduce transparency and Night
 * are per device (localStorage, applied to <html> at once and before first paint next time).
 * Gym Mode auto changes routing on every device, so it lives in profiles.prefs.
 */
export function AppearanceGroup({ profile }: { profile: Profile }) {
  const a = useAppearance();
  const savePrefs = useSavePrefs();
  const gymAuto = parseAppPrefs(profile.prefs).gymAuto;
  return (
    <Group id="appearance" title="Appearance" footer="Motion, transparency and night apply to this device. Gym Mode auto follows your account.">
      <ControlRow label="Motion" detail={a.motion === "reduce" ? "Fades instead of movement; the rest timer still drains" : "Follows the iPhone's Reduce Motion setting"} stack>
        <Segmented<MotionPref>
          ariaLabel="Motion"
          value={a.motion}
          onChange={(v) => saveAppearance({ motion: v })}
          options={[
            { value: "system", label: "System" },
            { value: "reduce", label: "Reduce" },
          ]}
        />
      </ControlRow>
      <SwitchRow
        label="Reduce transparency"
        detail="The tab bar and floating buttons become solid."
        checked={a.transparency === "reduce"}
        onChange={(v) => saveAppearance({ transparency: v ? "reduce" : "system" })}
      />
      <ControlRow label="Night" detail={a.night === "always" ? "The warmer night palette all day" : "Warmer and dimmer from 9 pm to 5 am"} stack>
        <Segmented<NightPref>
          ariaLabel="Night palette"
          value={a.night}
          onChange={(v) => saveAppearance({ night: v })}
          options={[
            { value: "auto", label: "Follows the day" },
            { value: "always", label: "Always" },
          ]}
        />
      </ControlRow>
      <SwitchRow
        label="Gym Mode auto"
        detail="Open straight into Gym Mode when a session is running."
        checked={gymAuto}
        onChange={(v) => savePrefs.mutate({ gymAuto: v })}
      />
    </Group>
  );
}
