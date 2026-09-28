import { addonFetch, httpUrl } from "./addon-streams.js";
import { addonResourceUrl, supports } from "./addons.js";
import { api } from "./api.js";

const previews = new Map();
const text = (value) => (typeof value === "string" ? value : "");
const strings = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
const identity = (addon, type, id) => JSON.stringify([addon.id, type, id]);
export function addonCatalogLabel(catalog) {
  const name = text(catalog.name).trim() || catalog.id;
  const type = text(catalog.type).trim();
  const label =
    { movie: "Movies", series: "Series", tv: "Live TV", channel: "Channels" }[
      type
    ] || (type ? type[0].toUpperCase() + type.slice(1) : "");
  if (
    !label ||
    name.toLowerCase() === label.toLowerCase() ||
    name.toLowerCase().endsWith(` - ${label.toLowerCase()}`)
  )
    return name;
  return `${name} - ${label}`;
}
export function addonCatalogPath(addon, catalog) {
  return `/addon/${encodeURIComponent(addon.id)}/catalog/${encodeURIComponent(catalog.type)}/${encodeURIComponent(catalog.id)}`;
}
export function addonTitlePath(addon, type, id) {
  return `/addon/${encodeURIComponent(addon.id)}/title/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
}
export function addonCatalogs(addon) {
  if (!addon.enabled) return [];
  return (
    Array.isArray(addon.manifest.catalogs) ? addon.manifest.catalogs : []
  ).filter(
    (item) =>
      item && typeof item.id === "string" && typeof item.type === "string",
  );
}
export function catalogExtras(catalog) {
  if (Array.isArray(catalog.extra))
    return catalog.extra.filter(
      (item) => item && typeof item.name === "string",
    );
  return strings(catalog.extraSupported).map((name) => ({
    name,
    isRequired: strings(catalog.extraRequired).includes(name),
  }));
}
export function normalizeAddonMeta(raw, addon, expectedType) {
  if (
    !raw ||
    typeof raw.id !== "string" ||
    !raw.id ||
    typeof raw.name !== "string"
  )
    return null;
  const type = text(raw.type) || expectedType;
  if (!type || (expectedType && type !== expectedType)) return null;
  const videos = (Array.isArray(raw.videos) ? raw.videos : [])
    .filter((video) => video && typeof video.id === "string" && video.id)
    .map((video) => ({
      id: video.id,
      title: text(video.title) || text(video.name) || video.id,
      season: Number.isInteger(video.season) ? video.season : null,
      episode: Number.isInteger(video.episode) ? video.episode : null,
      image: httpUrl(video.thumbnail),
      releaseDate: text(video.released).slice(0, 10),
      streams: Array.isArray(video.streams) ? video.streams : undefined,
    }));
  return {
    id: raw.id,
    addonId: raw.id,
    addonType: type,
    mediaType: type === "series" ? "tv" : type,
    typeLabel: type === "series" ? "Series" : type === "movie" ? "Movie" : type,
    title: raw.name,
    synopsis: text(raw.description),
    poster: httpUrl(raw.poster),
    backdrop: httpUrl(raw.background),
    logo: httpUrl(raw.logo),
    year: text(raw.releaseInfo) || text(raw.released).slice(0, 4),
    rating:
      raw.imdbRating && Number.isFinite(Number(raw.imdbRating))
        ? String(raw.imdbRating)
        : "NR",
    runtime: text(raw.runtime),
    genres: strings(raw.genres),
    cast: strings(raw.cast),
    director: strings(raw.director),
    videos,
    defaultVideoId: text(raw.behaviorHints?.defaultVideoId),
    isLive: type === "tv" || Boolean(raw.behaviorHints?.isLive),
    detailPath: addonTitlePath(addon, type, raw.id),
  };
}
export function rememberPreview(addon, item) {
  const key = identity(addon, item.addonType, item.addonId);
  previews.delete(key);
  previews.set(key, item);
  if (previews.size > 500) previews.delete(previews.keys().next().value);
}
export function addonPreview(addon, type, id) {
  return previews.get(identity(addon, type, id));
}
export async function getAddonCatalog(addon, catalog, extras, signal) {
  const allowed = catalogExtras(catalog);
  const values = {};
  for (const extra of allowed) {
    const value = extras[extra.name];
    if (extra.isRequired && (value === undefined || value === ""))
      throw new Error(`Choose ${extra.name} to browse this catalog.`);
    if (value !== undefined && value !== "") values[extra.name] = String(value);
  }
  const data = await addonFetch(
    addonResourceUrl(addon, "catalog", catalog.type, catalog.id, values),
    signal,
    { label: addon.manifest.name },
  );
  if (!Array.isArray(data?.metas))
    throw new Error("This add-on returned an invalid catalog.");
  const seen = new Set();
  const items = data.metas.flatMap((raw) => {
    const item = normalizeAddonMeta(raw, addon, catalog.type);
    if (!item || seen.has(item.id)) return [];
    seen.add(item.id);
    if (!signal?.aborted) rememberPreview(addon, item);
    return [item];
  });
  return { items, count: data.metas.length };
}
export async function getAddonMeta(provider, owner, type, id, signal) {
  if (!supports(provider, "meta", type, id))
    throw new Error("This provider does not support this title's metadata.");
  const data = await addonFetch(
    addonResourceUrl(provider, "meta", type, id),
    signal,
    { label: provider.manifest.name },
  );
  const meta = normalizeAddonMeta(data?.meta, owner, type);
  if (!meta || meta.id !== id)
    throw new Error("This provider has no metadata for this title.");
  return meta;
}

export function canUseTmdbMetadata(type, id) {
  return ["movie", "series"].includes(type) && /^tt\d+$/.test(id);
}

export async function getTmdbAddonMeta(
  owner,
  type,
  id,
  requestedSeason,
  signal,
) {
  const checkCancelled = () => {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  };
  checkCancelled();
  if (!canUseTmdbMetadata(type, id))
    throw new Error("TMDb needs an IMDb movie or series ID.");
  const details = await api.getDetailsByImdb(
    type === "series" ? "tv" : "movie",
    id,
  );
  checkCancelled();
  if (!details) throw new Error("TMDb has no matching title for this IMDb ID.");
  return {
    ...(await getTmdbTitleMeta(
      { ...details, imdbId: id },
      requestedSeason,
      signal,
    )),
    id,
    addonId: id,
    detailPath: addonTitlePath(owner, type, id),
  };
}

export async function getTmdbTitleMeta(details, requestedSeason, signal) {
  let videos = [];
  let selectedSeason;
  if (details.mediaType === "tv" && details.seasons.length) {
    const season =
      details.seasons.find((item) => item.seasonNumber === requestedSeason)
        ?.seasonNumber ?? details.seasons[0].seasonNumber;
    selectedSeason = season;
    const data = await api.getSeasonDetails(details.id, season, {
      strict: true,
    });
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    videos = data.episodes.map((episode) => ({
      id: `${details.imdbId || details.id}:${season}:${episode.episodeNumber}`,
      title: episode.title,
      season,
      episode: episode.episodeNumber,
      image: episode.image,
      releaseDate: episode.releaseDate,
    }));
  }
  return {
    ...details,
    tmdbDetails: details,
    addonId: details.imdbId || "",
    addonType: details.mediaType === "tv" ? "series" : "movie",
    typeLabel: details.mediaType === "tv" ? "Series" : "Movie",
    director: [],
    videos,
    tmdbSeasons: details.seasons,
    selectedSeason,
  };
}
