/* Project Greek God — service worker.
 *
 * Deliberately small: Web Push reminders, notification taps, and a single offline page for
 * navigations. No asset caching — the app always loads fresh code and live data, so a
 * stale copy can never show old numbers.
 */

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#08090C"><title>Offline · Project Greek God</title>
<style>
  html,body{margin:0;height:100%;background:#08090C;color:#F2EFE8;font:500 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));text-align:center;box-sizing:border-box}
  .mark{width:56px;height:56px;margin-bottom:20px}
  .eyebrow{font-size:11px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#E2C185;margin:0 0 10px}
  h1{font:700 28px/1 "Barlow Condensed","Arial Narrow",sans-serif;letter-spacing:.02em;text-transform:uppercase;margin:0}
  p{color:#A3A9B4;max-width:32ch;margin:12px auto 0}
  button{margin-top:24px;height:48px;padding:0 24px;border-radius:14px;border:1px solid rgba(213,172,103,.38);background:#1C2026;color:#E2C185;font:inherit;font-weight:700;line-height:1;cursor:pointer}
</style></head>
<body><main>
  <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="#D5AC67" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 9 12 3l10 6M3 11h18M2 21h20M6 13v6M12 13v6M18 13v6"/></svg>
  <p class="eyebrow">Project Greek God</p>
  <h1>You're offline</h1>
  <p>Your logs are safe in your account. Reconnect and this page will load with your latest numbers.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</main>
<script>addEventListener("online",function(){location.reload()})</script>
</body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // nothing is cached on purpose; clear anything an older worker may have left
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

// Network only. A page navigation that fails gets the offline page instead of the
// browser's error screen; everything else passes straight through.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.mode !== "navigate" || req.method !== "GET") return;
  event.respondWith(
    fetch(req).catch(
      () => new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }),
    ),
  );
});

/* ------------------------------------------------------------------ push */

function sameOriginUrl(raw) {
  try {
    const u = new URL(raw || "/", self.location.origin);
    return u.origin === self.location.origin ? u.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }
  const title = typeof data.title === "string" && data.title ? data.title : "Project Greek God";
  const options = {
    body: typeof data.body === "string" ? data.body : "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: typeof data.tag === "string" ? data.tag : "pgg",
    renotify: false,
    timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
    data: { url: sameOriginUrl(data.url), kind: data.kind || null },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = sameOriginUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue;
        await client.focus();
        if (client.url !== url && "navigate" in client) {
          try {
            await client.navigate(url);
          } catch {
            /* an uncontrolled window can't be navigated; focusing it is enough */
          }
        }
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser rotated this device's push subscription: register the new one with the
// server (same-origin fetch carries the signed-in session cookie).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key = old && old.options ? old.options.applicationServerKey : null;
      if (!key) return;
      const sub = event.newSubscription || (await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }));
      const json = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (old) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: old.endpoint }),
        }).catch(() => {});
      }
    })(),
  );
});
