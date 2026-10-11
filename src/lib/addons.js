import { useSyncExternalStore } from "react";
import {
  addonFetch,
  addonStreamList,
  httpUrl,
  normalizeHttpStream,
  normalizeSubtitles,
} from "./addon-streams.js";
import { torrentSource } from "./torrentio.js";
import { addonRegistrations } from "./addon-storage.js";
import { cachedAddonLogo } from "./addon-logos.js";
import { config } from "./api.js";
import { isNativeApp } from "../platform/index.js";

const storageKey = "rainflix:addons:session:v1";
function validManifest(manifest) {
  const strings = (value) =>
    Array.isArray(value) && value.every((item) => typeof item === "string");
  return Boolean(
    manifest &&
    typeof manifest.id === "string" &&
    typeof manifest.name === "string" &&
    strings(manifest.types) &&
    (!manifest.idPrefixes || strings(manifest.idPrefixes)) &&
    Array.isArray(manifest.resources) &&
    manifest.resources.every(
      (item) =>
        typeof item === "string" ||
        (item &&
          typeof item.name === "string" &&
          (!item.types || strings(item.types)) &&
          (!item.idPrefixes || strings(item.idPrefixes))),
    ),
  );
}
let installed = [];
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
  if (Array.isArray(saved))
    installed = saved.filter(
      (item) =>
        item?.id && validManifest(item.manifest) && httpUrl(item.manifestUrl),
    );
} catch {
  /* Session storage is optional. */
}
const listeners = new Set();
let restoring = true;
let storageRevision = 0;
let registrationSnapshot = [];
let registrationsRead = false;
const removedRegistrations = new Set();
export function useAddonRestoring() {
  return useSyncExternalStore(subscribe, () => restoring);
}
function registrations() {
  const values = new Map(registrationSnapshot.map((item) => [item.id, item]));
  for (const { id, manifestUrl, enabled, manifest } of installed)
    values.set(id, {
      id,
      manifestUrl,
      enabled,
      name: manifest.name,
    });
  return [...values.values()].filter(
    (item) => !removedRegistrations.has(item.id),
  );
}
addonRegistrations()
  .then(async (saved) => {
    registrationSnapshot = saved;
    registrationsRead = true;
    if (storageRevision > 0)
      addonRegistrations(registrations()).catch(() => {});
    if (!saved.length) {
      if (installed.length) await addonRegistrations(registrations());
      return;
    }
    const restored = await Promise.all(
      saved.map(async (item) => {
        try {
          const manifestUrl = manifestAddress(item.manifestUrl);
          const manifest = await addonFetch(manifestUrl, undefined, {
            label: "Add-on",
          });
          if (!validManifest(manifest)) return null;
          return {
            id: item.id,
            manifestUrl,
            enabled: item.enabled !== false,
            manifest,
          };
        } catch {
          if (!item?.id || !httpUrl(item.manifestUrl)) return null;
          return {
            ...item,
            unavailable: true,
            manifest: {
              id: item.id,
              name: item.name || "Unavailable add-on",
              types: [],
              resources: [],
            },
          };
        }
      }),
    );
    const current = new Map(installed.map((item) => [item.id, item]));
    for (const item of restored) {
      if (!item || removedRegistrations.has(item.id)) continue;
      const existing = current.get(item.id);
      current.set(
        item.id,
        existing
          ? {
              ...item,
              enabled: storageRevision > 0 ? existing.enabled : item.enabled,
              manifest: item.unavailable ? existing.manifest : item.manifest,
            }
          : item,
      );
    }
    installed = [...current.values()];
  })
  .catch(() => {})
  .then(async () => {
    const defaults = isNativeApp
      ? config.nativeDefaultAddons
      : config.webDefaultAddons;
    if (!Array.isArray(defaults)) return;
    const seedKey = isNativeApp
      ? "native-default-addons"
      : "web-default-addons";
    const seeded = new Set(
      await addonRegistrations(undefined, seedKey).catch(() => []),
    );
    await Promise.all(
      [...new Set(defaults)].map(async (address) => {
        try {
          const url = manifestAddress(address);
          if (seeded.has(url)) return;
          if (!installed.some((entry) => entry.manifestUrl === url))
            await installAddon(url, AbortSignal.timeout(5000));
          seeded.add(url);
        } catch {
          // An unavailable default provider must not block the catalog.
        }
      }),
    );
    await addonRegistrations([...seeded], seedKey).catch(() => {});
  })
  .finally(() => {
    installed.forEach((entry) => void cachedAddonLogo(entry.manifest.logo));
    restoring = false;
    listeners.forEach((listener) => listener());
  });
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useAddons() {
  return useSyncExternalStore(subscribe, () => installed);
}
function update(next) {
  installed = next;
  next.forEach((entry) => void cachedAddonLogo(entry.manifest.logo));
  storageRevision += 1;
  if (registrationsRead) addonRegistrations(registrations()).catch(() => {});
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    /* Keep in memory. */
  }
  listeners.forEach((listener) => listener());
}
export function removeAddon(id) {
  removedRegistrations.add(id);
  update(installed.filter((item) => item.id !== id));
}
export function toggleAddon(id) {
  update(
    installed.map((item) =>
      item.id === id ? { ...item, enabled: !item.enabled } : item,
    ),
  );
}
export function manifestAddress(value) {
  const url = new URL(
    String(value)
      .trim()
      .replace(/^stremio:\/\//i, "https://"),
  );
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Enter an HTTP(S) or stremio manifest URL.");
  if (!url.pathname.endsWith("/manifest.json"))
    throw new Error(
      "Use the manifest.json install link from the add-on configuration page.",
    );
  url.hash = "";
  return url.href;
}
export async function installAddon(address, signal) {
  const manifestUrl = manifestAddress(address);
  const manifest = await addonFetch(manifestUrl, signal, { label: "Add-on" });
  if (signal?.aborted)
    throw new DOMException("Installation cancelled", "AbortError");
  if (!validManifest(manifest))
    throw new Error("This URL did not return a valid Stremio manifest.");
  if (manifest.behaviorHints?.configurationRequired)
    throw new Error(
      "Configure this add-on first, then paste its configured manifest URL.",
    );
  const existing = installed.find((item) => item.manifestUrl === manifestUrl);
  const addon = {
    id: existing?.id || `addon:${crypto.randomUUID()}`,
    manifestUrl,
    manifest,
    enabled: true,
  };
  update([...installed.filter((item) => item.id !== addon.id), addon]);
  return addon;
}
export function supports(addon, resource, type, id) {
  return (
    addon.enabled &&
    addon.manifest.resources.some((entry) => {
      const spec =
        typeof entry === "string"
          ? {
              name: entry,
              types: addon.manifest.types,
              idPrefixes: addon.manifest.idPrefixes,
            }
          : entry;
      return (
        spec?.name === resource &&
        (spec.types || addon.manifest.types).includes(type) &&
        (!spec.idPrefixes ||
          spec.idPrefixes.some((prefix) => id.startsWith(prefix)))
      );
    })
  );
}
export function addonVideoIdentity(details, season = 1, episode = 1) {
  const type =
    details.addonType || (details.mediaType === "tv" ? "series" : "movie");
  const base = String(details.addonId || details.imdbId || "");
  const id =
    details.addonVideoId ||
    (type === "series" ? `${base}:${season}:${episode}` : base);
  return { type, id: base ? id : "" };
}
export function addonResourceUrl(addon, resource, type, id, extras = {}) {
  const url = new URL(addon.manifestUrl);
  const extra = Object.entries(extras)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");
  url.pathname = url.pathname.replace(
    /manifest\.json$/,
    `${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extra ? `/${extra}` : ""}.json`,
  );
  return url.href;
}
function resourceUrl(addon, resource, details, season, episode) {
  const { type, id } = addonVideoIdentity(details, season, episode);
  if (!id) throw new Error("This title has no matching ID for this add-on.");
  if (!supports(addon, resource, type, id)) return "";
  return addonResourceUrl(addon, resource, type, id);
}
export function addonProvider(addon) {
  const label = addon.manifest.name;
  return {
    label,
    addonId: addon.id,
    async getStreams(details, season, episode, signal) {
      let data;
      if (
        details.addonStreamOwner === addon.id &&
        Array.isArray(details.addonStreams)
      ) {
        data = { streams: details.addonStreams };
      } else {
        const url = resourceUrl(addon, "stream", details, season, episode);
        if (!url) return [];
        data = await addonFetch(url, signal, { label });
      }
      const seen = new Set();
      return addonStreamList(data, label).flatMap((raw, index) => {
        if (!raw || typeof raw !== "object") return [];
        const stream =
          normalizeHttpStream(raw, index, label) ||
          torrentSource(raw, index) ||
          (httpUrl(raw.externalUrl)
            ? {
                id: String(index),
                label: raw.name || "External stream",
                blockedReason: "Open this stream on the provider website.",
                externalUrl: httpUrl(raw.externalUrl),
                subtitles: [],
              }
            : null);
        if (!stream) return [];
        const key = stream.url || stream.torrentKey || stream.externalUrl;
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ ...stream, requiresStart: true }];
      });
    },
    async getSubtitles(details, season, episode, signal, extras = {}) {
      const { type, id } = addonVideoIdentity(details, season, episode);
      if (!id || !supports(addon, "subtitles", type, id)) return [];
      const url = addonResourceUrl(addon, "subtitles", type, id, extras);
      return normalizeSubtitles(
        (await addonFetch(url, signal, { label })).subtitles,
      ).map((item) => ({ ...item, label: `${label} / ${item.label}` }));
    },
  };
}

export async function installedSubtitles(
  addons,
  details,
  season,
  episode,
  stream,
  signal,
) {
  const { type, id } = addonVideoIdentity(details, season, episode);
  const matching = addons.filter((addon) =>
    supports(addon, "subtitles", type, id),
  );
  const results = await Promise.allSettled(
    matching.map((addon) =>
      addonProvider(addon).getSubtitles(
        details,
        season,
        episode,
        signal,
        stream.subtitleHints || {},
      ),
    ),
  );
  return {
    subtitles: results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    ),
    failed: results.some((result) => result.status === "rejected"),
  };
}
