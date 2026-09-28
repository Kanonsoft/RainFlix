importScripts(new URL("webtorrent-sw.min.js", self.location.href).href);

const BUILD_VERSION =
  new URL(self.location.href).searchParams.get("build") || "app";
const CACHE_VERSION = `rainflix-${BUILD_VERSION.replace(
  /[^a-z0-9._-]/gi,
  "-",
)}`;
const APP_CACHE = `${CACHE_VERSION}-app`;
const DATA_CACHE = `${CACHE_VERSION}-data`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const APP_ROOT = new URL("./", self.location.href).href;
const APP_SHELL = [
  APP_ROOT,
  new URL("manifest.webmanifest", APP_ROOT).href,
  new URL("rainflix-r.png", APP_ROOT).href,
  new URL("rainflix-preview.jpg", APP_ROOT).href,
];
const STATIC_REFERENCE_PATTERN =
  /["'`]((?:\.{0,2}\/|\/)[^"'`()\s]+\.(?:css|js|png|jpe?g|webp|svg|woff2?))["'`]/gi;

async function findReferencedAssets(cache, sourceUrls) {
  const references = new Set();

  await Promise.all(
    sourceUrls.map(async (sourceUrl) => {
      if (!/\.(?:css|js)$/i.test(sourceUrl)) {
        return;
      }

      const response = await cache.match(sourceUrl, { ignoreVary: true });
      if (!response) {
        return;
      }

      const source = await response.text();
      for (const match of source.matchAll(STATIC_REFERENCE_PATTERN)) {
        const url = new URL(match[1], sourceUrl);
        if (url.origin === self.location.origin) {
          references.add(url.href);
        }
      }
    }),
  );

  return [...references];
}

async function cacheAppShell() {
  const cache = await caches.open(APP_CACHE);
  const response = await fetch(APP_ROOT, { cache: "reload" });

  if (!response.ok) {
    throw new Error("The RainFlix app shell could not be fetched.");
  }

  await cache.put(APP_ROOT, response.clone());
  const html = await response.text();
  const assets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map((match) => new URL(match[1], APP_ROOT))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.href);

  const primaryAssets = [...new Set([...APP_SHELL.slice(1), ...assets])];
  await Promise.all(
    primaryAssets.map((url) => cache.add(url).catch(() => undefined)),
  );
  const referencedAssets = await findReferencedAssets(cache, primaryAssets);
  await Promise.all(
    referencedAssets.map((url) => cache.add(url).catch(() => undefined)),
  );
}

async function cacheResponse(cacheName, request, response, maximumEntries) {
  if (!response?.ok && response?.type !== "opaque") {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());

  if (maximumEntries) {
    const keys = await cache.keys();
    await Promise.all(
      keys
        .slice(0, Math.max(0, keys.length - maximumEntries))
        .map((key) => cache.delete(key)),
    );
  }

  return response;
}

async function networkFirst(request, cacheName, fallbackRequest = request) {
  try {
    const response = await fetch(request);
    return cacheResponse(cacheName, request, response);
  } catch {
    const cache = await caches.open(cacheName);
    return (
      (await cache.match(request, { ignoreVary: true })) ||
      (await cache.match(fallbackRequest, { ignoreVary: true })) ||
      Response.error()
    );
  }
}

async function cacheFirst(request, cacheName, maximumEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });

  if (cached) {
    return cached;
  }

  try {
    const response = await fetch(request);
    return cacheResponse(cacheName, request, response, maximumEntries);
  } catch {
    return Response.error();
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("rainflix-") &&
                ![APP_CACHE, DATA_CACHE, IMAGE_CACHE].includes(key),
            )
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === "navigate") {
      event.respondWith(networkFirst(request, APP_CACHE, APP_ROOT));
      return;
    }

    if (
      ["document", "font", "image", "script", "style"].includes(
        request.destination,
      )
    ) {
      event.respondWith(cacheFirst(request, APP_CACHE, 80));
    }
    return;
  }

  if (url.hostname === "image.tmdb.org") {
    event.respondWith(cacheFirst(request, IMAGE_CACHE, 140));
    return;
  }

  if (url.hostname === "api.themoviedb.org") {
    if (request.cache === "no-store") {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(networkFirst(request, DATA_CACHE));
  }
});
