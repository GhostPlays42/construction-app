// Keeps the worker's screens on the phone so they open with no signal.
//
// - App files (/_next/static) never change once built, so they come from the
//   phone's copy when it has one.
// - The worker's screens (home and their forms) come from the
//   server when there's signal, and the phone's last copy when there isn't.
//   Only pages marked data-offline-page are kept, so office screens never are.
// - Signing out clears the kept screens.

const PAGES = "pages-v1";
const STATIC = "static-v1";
const OFFLINE_PATHS = ["/", "/flha", "/time-card", "/safety-meeting", "/site-photos", "/trucking-slip", "/job-form"];
const MARKER = "data-offline-page";
// On a weak signal, wait this long for the server before using the phone's copy.
const NETWORK_WAIT_MS = 6000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== PAGES && key !== STATIC) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "clear-pages") event.waitUntil(caches.delete(PAGES));
  if (data.type === "warm") event.waitUntil(warm(data.paths || []));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fromCacheFirst(request));
  } else if (request.mode === "navigate" && OFFLINE_PATHS.includes(url.pathname) && !url.search) {
    event.respondWith(fromNetworkFirst(url.pathname));
  } else if (request.mode === "navigate" && url.pathname.startsWith("/chat/")) {
    // Chat needs signal; say so instead of the browser's error page.
    event.respondWith(
      fetch(request).catch(() => noSignal("Job chat needs signal. Your forms still work without it.")),
    );
  }
});

function noSignal(message) {
  return new Response(
    '<!doctype html><meta name="viewport" content="width=device-width"><title>No signal</title>' +
      '<body style="font:18px system-ui;padding:24px"><h1>No signal</h1><p>' +
      message +
      '</p><p><a href="/">Back to home</a></p></body>',
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function fromCacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function fromNetworkFirst(path) {
  const network = fetchAndKeep(path);
  network.catch(() => {});
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), NETWORK_WAIT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch {
    // No signal: fall through to the phone's copy.
  }
  const kept = await (await caches.open(PAGES)).match(path);
  if (kept) return kept;
  // Nothing kept yet; wait for the server after all, or explain.
  try {
    return await network;
  } catch {
    return noSignal("Open the app once with signal so it can work without it.");
  }
}

// Fetches a worker screen, keeps it if it's one to keep, and keeps the app
// files it needs. Being sent to the sign-in page clears the kept screens.
async function fetchAndKeep(path) {
  const res = await fetch(path, { credentials: "same-origin", redirect: "follow" });
  if (res.redirected) {
    if (new URL(res.url).pathname.startsWith("/login")) await caches.delete(PAGES);
    // A page load can't take a followed redirect, so hand it a fresh one.
    return Response.redirect(res.url, 303);
  }
  if (res.ok) {
    const html = await res.clone().text();
    if (html.includes(MARKER)) {
      const cache = await caches.open(PAGES);
      await cache.put(path, new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
      await keepAssets(html);
    }
  }
  return res;
}

// Every app file a page mentions, so it works with no signal.
async function keepAssets(html) {
  const found = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[^"'\s\\)]+/g)) found.add(m[0]);
  for (const m of html.matchAll(/(?:^|["'])static\/(?:chunks|css|media)\/[^"'\s\\)]+/g)) {
    found.add("/_next/" + m[0].replace(/^["']/, ""));
  }
  const cache = await caches.open(STATIC);
  await Promise.all(
    [...found].map(async (asset) => {
      if (await cache.match(asset)) return;
      try {
        const res = await fetch(asset);
        if (res.ok) await cache.put(asset, res);
      } catch {}
    }),
  );
}

async function warm(paths) {
  for (const path of paths) {
    if (!OFFLINE_PATHS.includes(path)) continue;
    try {
      await fetchAndKeep(path);
    } catch {}
  }
}

// App notifications, such as "Your schedule changed". Tapping one opens the
// app (or brings it forward) at the page the notification names.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || "Construction App", {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      renotify: typeof data.tag === "string",
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
