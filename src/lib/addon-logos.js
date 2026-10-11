import { useEffect, useState } from "react";
import { httpUrl } from "./addon-streams.js";

const lifetime = 7 * 24 * 60 * 60 * 1000;
const pending = new Map();
let database;
let revision = 0;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("rainflix-addon-artwork", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("logos");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  return database;
}
async function cacheKey(url) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(url),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function load(url) {
  const generation = revision;
  let db, key, stored;
  try {
    key = await cacheKey(url);
    db = await open();
    stored = await new Promise((resolve, reject) => {
      const request = db.transaction("logos").objectStore("logos").get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (stored?.expiresAt > Date.now()) return stored.image;
  } catch {
    /* Artwork must also work without persistent storage. */
  }
  let bitmap;
  try {
    const response = await fetch(url, {
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error("Logo unavailable");
    const blob = await response.blob();
    if (!blob.type.startsWith("image/") || blob.size > 2 * 1024 * 1024)
      throw new Error("Invalid logo");
    bitmap = await createImageBitmap(blob);
    if (bitmap.width > 8192 || bitmap.height > 8192)
      throw new Error("Oversized logo");
    const scale = Math.min(1, 128 / bitmap.width, 128 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas
      .getContext("2d")
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/png");
    if (db && key && revision === generation) {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction("logos", "readwrite");
        transaction
          .objectStore("logos")
          .put({ image, expiresAt: Date.now() + lifetime }, key);
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      }).catch(() => {});
    }
    return image;
  } catch {
    return stored?.image || url;
  } finally {
    bitmap?.close();
  }
}
export function cachedAddonLogo(value) {
  const url = httpUrl(value);
  if (!url) return Promise.resolve("");
  if (!pending.has(url)) pending.set(url, load(url));
  return pending.get(url);
}
export function useCachedAddonLogo(url) {
  const [loaded, setLoaded] = useState(null);
  useEffect(() => {
    let live = true;
    cachedAddonLogo(url).then((image) => {
      if (live) setLoaded({ url, image });
    });
    return () => {
      live = false;
    };
  }, [url]);
  return loaded?.url === url ? loaded.image : "";
}
export async function clearAddonLogoCache() {
  revision++;
  pending.clear();
  const db = await open();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction("logos", "readwrite");
    transaction.objectStore("logos").clear();
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
