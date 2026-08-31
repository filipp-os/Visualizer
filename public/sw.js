const VERSION = "v3";
const CACHE_NAME = `pedro-visualizer-${VERSION}`;

const APP_STATIC_RESOURCES = [
  "/",
  "/favicon.ico",
  "/fields/centerstage.webp",
  "/fields/intothedeep.webp",
  "/fields/decode.webp",
  "/robot.png",
  "/assets/index.js",
  "/assets/index.css",
  "/fonts/Poppins-Regular.ttf",
  "/fonts/Poppins-SemiBold.ttf",
  "/fonts/Poppins-Light.ttf",
  "/fonts/Poppins-ExtraLight.ttf",
];

// On install, cache the static resources
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      cache.addAll(APP_STATIC_RESOURCES);
    })(),
  );
});

// delete old caches on activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
          return undefined;
        }),
      );
      await clients.claim();
    })(),
  );
});

// On fetch, intercept server requests
// and respond with cached responses instead of going to network
self.addEventListener("fetch", (event) => {
  // As a single page app, direct app to always go to cached home page.
  // if (event.request.mode === "navigate") {
  //   event.respondWith(caches.match("/"));
  //   return;
  // }

  const url = new URL(event.request.url);

  // Never cache or intercept anything that isn't a plain GET, or that talks to
  // the local export bridge / Vite's own endpoints — those must always hit the
  // network so live state (bridge status, HMR, module graph) is never stale.
  if (
    event.request.method !== "GET" ||
    url.pathname.startsWith("/__bridge/") ||
    url.pathname.startsWith("/@") ||
    url.pathname.startsWith("/node_modules/") ||
    url.pathname.startsWith("/src/")
  ) {
    return; // fall through to the network with no SW involvement
  }

  // For all other requests, go to the cache first, and then the network.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request.url);
      if (cachedResponse) {
        // Return the cached response if it's available.
        return cachedResponse;
      }
      // Try network if not in cache
      try {
        const networkResponse = await fetch(event.request);
        // Cache successful responses for future use
        if (networkResponse.ok) {
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // If both cache and network fail, return a 404.
        return new Response(null, { status: 404 });
      }
    })(),
  );
});
