/* Project Greek God — service worker.
 *
 * Web Push reminders, notification taps, and the offline app shell (docs/DESIGN-V2.md §5.2 item 6):
 * - pages (navigations): network first; a copy of each page's HTML is kept so an offline cold start
 *   still opens the app (the HTML carries no user data: app screens render on the client), and the
 *   data comes back from the persisted query cache (src/lib/offline). No copy → the offline page.
 * - /_next/static/* (content-hashed, immutable): cache first.
 * - /art/*: stale-while-revalidate.
 * - Everything else (API routes, Supabase, RSC fetches) passes straight through, never cached:
 *   live data is never served stale by the worker.
 * The cache name carries the deploy's version (`/sw.js?v=<build>`), so each deploy starts clean.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "1";
const SHELL_CACHE = "pgg-shell-" + VERSION;

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#09090B"><title>Offline · Project Greek God</title>
<style>
  html,body{margin:0;height:100%;background:#09090B;color:#F2EBDD;font:500 16px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
  main{min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:calc(24px + env(safe-area-inset-top)) 24px calc(24px + env(safe-area-inset-bottom));text-align:center;box-sizing:border-box}
  .mark{width:56px;height:56px;margin-bottom:20px}
  .eyebrow{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#A39B8D;margin:0 0 10px}
  h1{font:600 34px/1.05 "Cormorant Garamond",Georgia,serif;margin:0}
  p{color:#B9B1A2;max-width:32ch;margin:12px auto 0}
  button{margin-top:24px;height:48px;padding:0 24px;border-radius:16px;border:0;box-shadow:inset 0 0 0 1px rgba(224,184,102,.38);background:#1E1E23;color:#EED08B;font:inherit;font-weight:600;line-height:1;cursor:pointer}
</style></head>
<body><main>
  <svg class="mark" viewBox="0 0 24 24" fill="none" stroke="#E0B866" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M2 9 12 3l10 6M3 11h18M2 21h20M6 13v6M12 13v6M18 13v6"/></svg>
  <p class="eyebrow">Project Greek God</p>
  <h1>You&#39;re offline</h1>
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

  if (url.pathname.startsWith("/art/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const hit = await cache.match(req);
        const refresh = fetch(req)
          .then((res) => {
            if (res.ok) return cache.put(req, res.clone()).then(() => res);
            return res;
          })
          .catch(() => null);
        if (hit) {
          event.waitUntil(refresh);
          return hit;
        }
        return (await refresh) || new Response("", { status: 504 });
      })(),
    );
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
