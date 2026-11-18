// Offline support. All paths are relative to this file, so the app works under any host and sub-path.
const CACHE = "curriculum-compass-v16";
const SHELL = ["./", "index.html", "style.css", "app.js", "icon.svg", "manifest.webmanifest", "data/index.json", "data/search.json", "l10n/en.json", "l10n/de.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page sends the list of all programme files once, so every curriculum is available offline.
self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "precache") {
    e.waitUntil(caches.open(CACHE).then(async (c) => {
      for (const url of e.data.urls) {
        if (!(await c.match(url))) {
          try { await c.add(url); } catch { /* try again next time */ }
        }
      }
    }));
  }
});

// Network first, so online users always get fresh data; the cached copy is the offline fallback.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Only this app's own files: the host may serve other things next to it (e.g. a visit counter or another site).
  if (req.method !== "GET" || !req.url.startsWith(self.registration.scope)) return;
  // Revalidate with the server every time, so a new deploy (or a local edit) shows up on the next load.
  const fresh = req.mode === "navigate" ? fetch(req) : fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
  e.respondWith(
    fresh
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
