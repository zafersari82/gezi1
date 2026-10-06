const CACHE = "vado-business-static-2.6";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(["/offline", "/icon.svg"])));
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (names) => {
      await Promise.all(
        names
          .filter((name) => name.startsWith("vado-business-static-") && name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    }),
  );
});
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const old = await cache.match(event.request);
        if (old !== undefined) return old;
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      }),
    );
  } else if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(async () => (await caches.match("/offline")) ?? Response.error()),
    );
  }
});
