import { useSyncExternalStore } from "react";
import {
  addonFetch,
  addonStreamList,
  httpUrl,
  normalizeHttpStream,
  normalizeSubtitles,
} from "./addon-streams.js";
import { torrentSource } from "./torrentio.js";

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
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function useAddons() {
  return useSyncExternalStore(subscribe, () => installed);
}
function update(next) {
  installed = next;
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    /* Keep in memory. */
  }
  listeners.forEach((listener) => listener());
}
export function removeAddon(id) {
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
    async getSubtitles(details, season, episode, signal) {
      const url = resourceUrl(addon, "subtitles", details, season, episode);
      if (!url) return [];
      return normalizeSubtitles(
        (await addonFetch(url, signal, { label })).subtitles,
      );
    },
  };
}
