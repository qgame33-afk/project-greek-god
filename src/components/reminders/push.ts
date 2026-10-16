"use client";

// Browser side of Web Push: capability detection (incl. the iPhone Home Screen rule),
// subscribe/unsubscribe, and keeping the server's copy of this device in sync.

export type PushSupport =
  | { ok: true; ios: boolean; standalone: boolean }
  | { ok: false; reason: "insecure" | "ios-install" | "ios-old" | "unsupported"; ios: boolean; standalone: boolean };

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function iosVersion(): number | null {
  const m = /OS (\d+)[_.](\d+)/.exec(navigator.userAgent);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function detectPush(): PushSupport {
  const ios = isIOS();
  const standalone = isStandalone();
  if (!window.isSecureContext) return { ok: false, reason: "insecure", ios, standalone };
  const has = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (has) return { ok: true, ios, standalone };
  if (ios) {
    const v = iosVersion();
    if (v != null && v < 16.4) return { ok: false, reason: "ios-old", ios, standalone };
    // Safari only exposes Web Push to web apps opened from the Home Screen
    return { ok: false, reason: standalone ? "ios-old" : "ios-install", ios, standalone };
  }
  return { ok: false, reason: "unsupported", ios, standalone };
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array) {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** The app's service worker registration (registers /sw.js if this is the first use). */
export async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (!existing) await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error("The app's background worker didn't start. Reload and try again.")), 10_000));
  return Promise.race([ready, timeout]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

async function api(path: string, init: RequestInit) {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init.headers ?? {}) } });
  } catch {
    throw new Error("You're offline. Reconnect and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw Object.assign(new Error(String(json.error ?? `The reminders service didn't respond (${res.status}). Try again.`)), { code: json.code });
  return json;
}

export async function saveSubscription(sub: PushSubscription) {
  const j = sub.toJSON();
  return api("/api/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys, userAgent: navigator.userAgent.slice(0, 300) }) }) as Promise<{ devices: number }>;
}

/**
 * Must be called from a tap: iOS only shows the permission prompt inside a user gesture,
 * so the permission request comes before any network work.
 */
export async function enablePush(): Promise<{ devices: number }> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw Object.assign(new Error(permission === "denied" ? "Notifications are blocked for this app." : "Notifications weren't allowed."), { code: permission });
  const { publicKey } = (await api("/api/push/key", { method: "GET" })) as { publicKey: string };
  const key = urlBase64ToUint8Array(publicKey);
  const reg = await ensureRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    } catch (e) {
      throw new Error(`This browser couldn't register for push (${(e as Error).message || "push service error"}).`);
    }
  }
  return saveSubscription(sub);
}

export async function disablePush(): Promise<{ devices: number }> {
  const sub = await currentSubscription();
  const endpoint = sub?.endpoint;
  await sub?.unsubscribe().catch(() => {});
  if (!endpoint) return { devices: 0 };
  return api("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) }) as Promise<{ devices: number }>;
}

export async function sendTest() {
  try {
    return (await api("/api/reminders/test", { method: "POST", body: "{}" })) as { sent: number; removed: number };
  } catch (e) {
    // the server dropped this device: drop the browser's dead subscription too, so
    // "Enable on this device" can register a fresh one
    if ((e as { code?: string }).code === "expired") await (await currentSubscription().catch(() => null))?.unsubscribe().catch(() => {});
    throw e;
  }
}
