import { addonFetch, httpUrl } from "./addon-streams.js";
import { addonResourceUrl, supports } from "./addons.js";
import { api, config } from "./api.js";

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

function isSeasonSplit(grouped, defaults) {
  if (grouped.length <= defaults.length) return false;
  const expected = new Set(
    defaults.flatMap((season) =>
      Array.from(
        { length: season.episodeCount },
        (_, index) => `${season.seasonNumber}:${index + 1}`,
      ),
    ),
  );
  let previousSeason = -1;
  let previousEpisode = 0;
  for (const [index, season] of grouped.entries()) {
    if (season.seasonNumber !== index + 1 || !season.episodes.length)
      return false;
    const sourceSeason = season.episodes[0].sourceSeasonNumber;
    for (const episode of season.episodes) {
      if (
        episode.sourceSeasonNumber !== sourceSeason ||
        sourceSeason < previousSeason ||
        (sourceSeason === previousSeason &&
          episode.sourceEpisodeNumber <= previousEpisode) ||
        !expected.delete(`${sourceSeason}:${episode.sourceEpisodeNumber}`)
      )
        return false;
      previousSeason = sourceSeason;
      previousEpisode = episode.sourceEpisodeNumber;
    }
  }
  return expected.size === 0;
}

async function resolveEpisodeOrder(details, signal) {
  const defaults = details.tmdbDefaultSeasons || details.seasons;
  const override = config.tmdbEpisodeGroups?.[details.id];
  if (override === false) return null;
  const configured = typeof override === "string" ? override : null;
  if (configured)
    return { id: configured, seasons: await api.getEpisodeGroup(configured) };
  if (
    config.tmdbAutoEpisodeGroups === false ||
    !defaults.length ||
    defaults.reduce((sum, season) => sum + (season.episodeCount || 0), 0) >
      10000 ||
    defaults.some(
      (season) =>
        !Number.isInteger(season.episodeCount) ||
        season.episodeCount <= 0 ||
        season.episodeCount > 10000,
    )
  )
    return null;
  if (details.tmdbEpisodeGroupId) {
    const seasons = await api.getEpisodeGroup(details.tmdbEpisodeGroupId);
    return isSeasonSplit(seasons, defaults)
      ? { id: details.tmdbEpisodeGroupId, seasons }
      : null;
  }
  const candidates = (await api.getEpisodeGroups(details.id))
    .filter((group) => group.type === 6 && group.group_count > defaults.length)
    .sort(
      (a, b) =>
        Number(/^seasons$/i.test(b.name || "")) -
          Number(/^seasons$/i.test(a.name || "")) || a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  for (const group of candidates) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    try {
      const seasons = await api.getEpisodeGroup(group.id);
      if (isSeasonSplit(seasons, defaults)) return { id: group.id, seasons };
    } catch {
      // Try another season order; a failed candidate must not block the title.
    }
  }
  return null;
}

export async function getTmdbTitleMeta(details, requestedSeason, signal) {
  let videos = [];
  let selectedSeason;
  let groupedSeasons;
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (details.mediaType === "tv") {
    const defaults = details.tmdbDefaultSeasons || details.seasons;
    try {
      const order = await resolveEpisodeOrder(details, signal);
      groupedSeasons = order?.seasons;
      details = {
        ...details,
        tmdbDefaultSeasons: defaults,
        tmdbEpisodeGroupId: order?.id,
        seasons: groupedSeasons
          ? groupedSeasons.map((season) => ({
              seasonNumber: season.seasonNumber,
              name: season.name,
              episodeCount: season.episodes.length,
            }))
          : defaults,
        runtime: groupedSeasons
          ? `${groupedSeasons.length} seasons`
          : details.runtime,
      };
    } catch {
      // An unavailable alternate order must not block the original metadata.
      details = {
        ...details,
        seasons: defaults,
        tmdbEpisodeGroupId: undefined,
      };
    }
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  }
  if (details.mediaType === "tv" && details.seasons.length) {
    const season =
      details.seasons.find((item) => item.seasonNumber === requestedSeason)
        ?.seasonNumber ?? details.seasons[0].seasonNumber;
    selectedSeason = season;
    const data =
      groupedSeasons?.find((item) => item.seasonNumber === season) ||
      (await api.getSeasonDetails(details.id, season, {
        strict: true,
      }));
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    const episodes = [...data.episodes].sort(
      (a, b) => a.episodeNumber - b.episodeNumber,
    );
    // TMDb anime seasons can retain absolute numbering; stream providers use SxxEyy.
    const offset =
      season > 0 ? Math.max(0, (episodes[0]?.episodeNumber || 1) - 1) : 0;
    videos = episodes.map((episode) => ({
      id: `${details.imdbId || details.id}:${season}:${episode.episodeNumber - offset}`,
      sourceVideoId: `${details.imdbId || details.id}:${episode.sourceSeasonNumber ?? season}:${episode.sourceEpisodeNumber ?? episode.episodeNumber}`,
      sourceSeasonNumber: episode.sourceSeasonNumber ?? season,
      sourceEpisodeNumber: episode.sourceEpisodeNumber ?? episode.episodeNumber,
      title: episode.title,
      season,
      episode: episode.episodeNumber - offset,
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
