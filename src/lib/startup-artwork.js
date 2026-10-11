import { api } from "./api.js";
import { clearAddonLogoCache } from "./addon-logos.js";

export const seedPosters = Object.values(
  import.meta.glob("../../assets/startup/*.jpg", {
    eager: true,
    query: "?url",
    import: "default",
  }),
);
const week = 7 * 24 * 60 * 60 * 1000;
let database;
let refreshing;
let generation = 0;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("rainflix-startup-artwork", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("artwork");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
async function read() {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction("artwork")
      .objectStore("artwork")
      .get("weekly");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function startupPosters() {
  try {
    const stored = await read();
    if (stored?.images?.length)
      return stored.images.map((image) => URL.createObjectURL(image));
  } catch {
    /* Bundled artwork also works offline and without storage. */
  }
  return seedPosters;
}
export function refreshStartupArtwork() {
  if (refreshing) return refreshing;
  const revision = generation;
  refreshing = (async () => {
    const stored = await read().catch(() => null);
    if (stored?.expiresAt > Date.now()) return;
    const urls = await api.getLoaderPosters(35);
    const images = [];
    for (const url of urls || []) {
      if (revision !== generation) return;
      if (!url.startsWith("https://image.tmdb.org/")) continue;
      try {
        const response = await fetch(url.replace("/w500/", "/w185/"), {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.type.startsWith("image/") && blob.size < 1000000)
            images.push(blob);
        }
      } catch {
        /* Retain the existing snapshot when the image host fails. */
      }
    }
    if (images.length < 10 || revision !== generation) return;
    const db = await open();
    if (revision !== generation) return;
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("artwork", "readwrite");
      transaction
        .objectStore("artwork")
        .put({ images, expiresAt: Date.now() + week }, "weekly");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  })()
    .catch(() => {})
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}
export async function clearArtworkCache() {
  generation += 1;
  await clearAddonLogoCache();
  const db = await open();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("artwork", "readwrite");
    transaction.objectStore("artwork").clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  for (const key of Object.keys(localStorage))
    if (key.startsWith("rainflix:tmdb:") || key === "rainflix:title-logos:v1")
      localStorage.removeItem(key);
  if (typeof caches !== "undefined")
    for (const name of await caches.keys())
      if (name.startsWith("rainflix") && name.includes("image"))
        await caches.delete(name);
}
