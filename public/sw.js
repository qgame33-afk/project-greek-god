/* Project Greek God — service worker.
 *
 * Web Push reminders, notification taps, and the offline app shell (docs/DESIGN-V2.md §5.2 item 6):
 * - pages (navigations): network first; a copy of each page's HTML is kept so an offline cold start
 *   still opens the app (the HTML carries no user data: app screens render on the client), and the
 *   data comes back from the persisted query cache (src/lib/offline). No copy → the offline page.
 * - /_next/static/* (content-hashed, immutable): cache first.
 * - Everything else (API routes, Supabase, RSC fetches) passes straight through, never cached:
 *   live data is never served stale by the worker.
 * The cache name carries the deploy's version (`/sw.js?v=<build>`), so each deploy starts clean.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const SHELL_CACHE = "pgg-shell-" + VERSION;

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#000000"><title>Offline · Project Greek God</title>
<style>
  html,body{margin:0;height:100%;background:#000;color:#f5f5f7;font:400 17px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif}
  main{min-height:100%;display:flex;align-items:center;justify-content:center;padding:calc(24px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom));box-sizing:border-box}
  .card{width:100%;max-width:400px;background:#141416;border-radius:24px;padding:28px 24px;text-align:center;box-sizing:border-box}
  h1{font-size:24px;font-weight:800;letter-spacing:-.02em;margin:0}
  p{color:#a1a1a6;font-size:15px;max-width:32ch;margin:8px auto 0}
  button{margin-top:24px;width:100%;height:52px;border-radius:999px;border:0;background:#222226;color:#f5f5f7;font:inherit;font-weight:700;cursor:pointer}
</style></head>
<body><main><div class="card">
  <h1>You&#39;re offline</h1>
  <p>Your logs are safe in your account. This page loads once you&#39;re back.</p>
  <button type="button" onclick="location.reload()">Try again</button>
</div></main>
<script>addEventListener("online",function(){location.reload()})</script>
</body></html>`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // drop every cache but this deploy's shell
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

const offlineResponse = () =>
  new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });

/** The page's cache key: its path only (query strings like ?add=1 share the copy). */
const pageKey = (url) => new URL(url.pathname, url.origin).href;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          // keep a copy of real pages only (not redirects to sign-in, not errors)
          if (res.ok && res.type === "basic" && !res.redirected) {
            const copy = res.clone();
            event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.put(pageKey(url), copy)));
          }
          return res;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(pageKey(url))) || offlineResponse();
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) event.waitUntil(cache.put(req, res.clone()));
        return res;
      })(),
    );
    return;
  }
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
