"use client";

/** Best-effort haptic tap. iOS Safari ignores navigator.vibrate; iOS 18+ ticks on a switch toggle. */
export function haptic(pattern: number | number[] = 12) {
  if (typeof window === "undefined") return;
  if (localStorage.getItem("pgg.haptics") === "off") return;
  try {
    if ("vibrate" in navigator && typeof navigator.vibrate === "function" && navigator.vibrate(pattern)) return;
  } catch {
    /* ignore */
  }
  try {
    let label = document.getElementById("pgg-haptic") as HTMLLabelElement | null;
    if (!label) {
      label = document.createElement("label");
      label.id = "pgg-haptic";
      label.setAttribute("aria-hidden", "true");
      label.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("switch", "");
      input.tabIndex = -1;
      label.appendChild(input);
      document.body.appendChild(label);
    }
    label.click();
  } catch {
    /* ignore */
  }
}
