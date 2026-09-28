const STORAGE_KEY = "rainflix:playback-progress:v1";
const MAX_ENTRIES = 200;
const SAVE_INTERVAL = 5000;
const memory = new Map();
const persistedAt = new Map();
const storedKey =
  /^(?:tmdb:(?:movie|tv):\d+|imdb:(?:movie|tv):tt\d+)(?::s\d+:e\d+)?$/;

function validProgress(value) {
  return (
    Number.isFinite(value?.position) &&
    value.position >= 0 &&
    Number.isFinite(value.duration) &&
    value.duration > 0 &&
    value.position <= value.duration &&
    Number.isFinite(value.updatedAt)
  );
}

function readStored() {
  try {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return new Map(
      (Array.isArray(entries) ? entries : [])
        .filter(
          (entry) =>
            Array.isArray(entry) &&
            storedKey.test(entry[0]) &&
            validProgress(entry[1]),
        )
        .slice(0, MAX_ENTRIES),
    );
  } catch {
    return new Map();
  }
}

export function playbackIdentity(details, season = 1, episode = 1) {
  if (!details || details.isLive) return null;
  const title = details.tmdbDetails;
  const type =
    (title?.mediaType || details.mediaType) === "tv" ? "tv" : "movie";
  const suffix =
    type === "tv"
      ? `:s${Math.max(0, Number.parseInt(season, 10) || 0)}:e${Math.max(1, Number.parseInt(episode, 10) || 1)}`
      : "";
  if (title && /^\d+$/.test(String(title.id)))
    return { key: `tmdb:${type}:${title.id}${suffix}`, persistent: true };
  if (/^tt\d+$/.test(details.imdbId || ""))
    return { key: `imdb:${type}:${details.imdbId}${suffix}`, persistent: true };
  // Custom add-on identities stay in memory, like their metadata and stream URLs.
  if (!details.addonId) return null;
  return {
    key: JSON.stringify([
      details.addonType,
      details.addonId,
      details.addonVideoId || details.addonId,
    ]),
    persistent: false,
  };
}

export function readPlaybackPosition(identity) {
  if (!identity) return 0;
  const cached = memory.get(identity.key);
  const stored = identity.persistent ? readStored().get(identity.key) : null;
  const value =
    stored && (!cached || stored.updatedAt > cached.updatedAt)
      ? stored
      : cached;
  return validProgress(value) && !value.completed ? value.position : 0;
}

export function savePlaybackProgress(identity, sample, flush = false) {
  if (!identity) return;
  const value = {
    position: sample.completed ? 0 : sample.position,
    duration: sample.duration,
    completed: sample.completed === true,
    updatedAt: Date.now(),
  };
  if (!validProgress(value)) return;
  memory.delete(identity.key);
  memory.set(identity.key, value);
  if (memory.size > MAX_ENTRIES) memory.delete(memory.keys().next().value);
  if (
    !identity.persistent ||
    !storedKey.test(identity.key) ||
    (!flush &&
      Date.now() - (persistedAt.get(identity.key) || 0) < SAVE_INTERVAL)
  )
    return;
  try {
    const entries = readStored();
    entries.set(identity.key, value);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        [...entries]
          .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
          .slice(0, MAX_ENTRIES),
      ),
    );
    persistedAt.set(identity.key, Date.now());
  } catch {
    // Seeking still works between players when browser storage is unavailable.
  }
}

export function clearPlaybackProgress() {
  memory.clear();
  persistedAt.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* Optional storage. */
  }
}

export function resumedFrameUrl(source, position) {
  if (
    !["vidlink", "vidfast", "vidcore"].includes(source.id) ||
    !Number.isFinite(position) ||
    position <= 0
  )
    return source.url;
  const url = new URL(source.url);
  url.searchParams.set("startAt", String(Math.floor(position)));
  return url.href;
}

export function framePlaybackEvent(data, details, season, episode) {
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (data?.type !== "PLAYER_EVENT" || !data.data) return null;
  const event = data.data;
  const title = details.tmdbDetails;
  if (!title) return null;
  const id = event.tmdbId ?? event.mtmdbId ?? event.id;
  if (id != null && ![String(title.id), title.imdbId].includes(String(id)))
    return null;
  if (
    (event.mediaType != null &&
      event.mediaType !== title.mediaType &&
      !(event.mediaType === "series" && title.mediaType === "tv")) ||
    (event.season != null && Number(event.season) !== Number(season)) ||
    (event.episode != null && Number(event.episode) !== Number(episode))
  )
    return null;
  const name = String(event.event || "").toLowerCase();
  if (
    !["play", "playing", "timeupdate", "pause", "seeked", "ended"].includes(
      name,
    )
  )
    return null;
  const sample = {
    position: event.currentTime,
    duration: event.duration,
    completed: name === "ended",
  };
  return {
    name,
    sample: validProgress({ ...sample, updatedAt: Date.now() }) ? sample : null,
  };
}
