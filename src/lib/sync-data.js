import { cleanPlaybackPreference } from "./playback-preferences.js";

export const syncStores = {
  list: "rainflix:my-list:v1",
  recent: "rainflix:recently-viewed:v1",
  watched: "rainflix:watched:v1",
  progress: "rainflix:playback-progress:v1",
  settings: "rainflix:settings:v1",
  playback: "rainflix:playback-preferences:v1",
};
export const defaultSyncOptions = {
  list: true,
  history: true,
  watched: true,
  settings: true,
  addons: true,
};
export function syncRecordSelected(key, options = defaultSyncOptions) {
  const kind = key.split("/")[0];
  return (
    options[
      ["recent", "progress", "playback"].includes(kind) ? "history" : kind
    ] === true
  );
}
export function selectedSyncRecords(records, options) {
  return Object.fromEntries(
    Object.entries(records).filter(([key]) => syncRecordSelected(key, options)),
  );
}
const sharedSettings = new Set([
  "subtitleLanguage",
  "audioLanguage",
  "skipIntro",
  "skipOutro",
  "autoNext",
  "preloadNext",
  "nextPreview",
  "subtitleScale",
  "subtitlePosition",
  "subtitleDelay",
]);
const titleFields = new Set([
  "id",
  "mediaType",
  "title",
  "year",
  "rating",
  "synopsis",
  "season",
  "episode",
  "savedAt",
  "viewedAt",
  "watchedAt",
  "markedWatched",
  "watchedEpisodes",
  "seasonEpisodeCounts",
  "sourceEpisodeNumber",
  "sourceSeasonNumber",
  "videoId",
]);
function artwork(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "image.tmdb.org"
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function cleanTitle(value) {
  if (!value?.id || !["tv", "movie"].includes(value.mediaType)) return null;
  const result = Object.fromEntries(
    Object.entries(value).filter(([key]) => titleFields.has(key)),
  );
  for (const key of ["poster", "backdrop", "logo"])
    result[key] = artwork(value[key]);
  if (
    typeof value.detailPath === "string" &&
    /^\/(?:title|addon)\//.test(value.detailPath) &&
    !/[?#]/.test(value.detailPath)
  )
    result.detailPath = value.detailPath;
  return result;
}
export function readSyncData(storage) {
  const values = {};
  for (const [kind, key] of Object.entries(syncStores)) {
    let saved;
    try {
      saved = JSON.parse(storage.getItem(key) || "null");
    } catch {
      saved = null;
    }
    if (kind === "playback") {
      for (const [name, value] of Object.entries(saved || {})) {
        if (name.length > 480 || !/^(movie|tv):/.test(name)) continue;
        const preference = cleanPlaybackPreference(value);
        if (preference) values[`playback/${name}`] = preference;
      }
    } else if (kind === "settings") {
      for (const [name, value] of Object.entries(saved || {}))
        if (sharedSettings.has(name)) values[`settings/${name}`] = value;
    } else if (kind === "progress") {
      for (const [name, value] of Array.isArray(saved) ? saved : []) {
        if (typeof name !== "string" || !/^(tmdb|imdb|addon):/.test(name))
          continue;
        if (
          !Number.isFinite(value?.position) ||
          !Number.isFinite(value.duration) ||
          value.position < 0 ||
          value.duration <= 0 ||
          value.position > value.duration
        )
          continue;
        values[`progress/${name}`] = {
          position: value.position,
          duration: value.duration,
          updatedAt: value.updatedAt,
          completed: value.completed === true,
        };
      }
    } else {
      for (const item of Array.isArray(saved) ? saved : []) {
        const clean = cleanTitle(item);
        if (clean) values[`${kind}/${clean.mediaType}:${clean.id}`] = clean;
      }
    }
  }
  return values;
}
export function syncValuesEqual(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(
      (key) => Object.hasOwn(b, key) && syncValuesEqual(a[key], b[key]),
    )
  );
}
export function captureChanges(journal, previous, current, now = Date.now()) {
  const next = { ...journal };
  for (const key of new Set([
    ...Object.keys(previous),
    ...Object.keys(current),
  ])) {
    if (syncValuesEqual(previous[key], current[key])) continue;
    next[key] = {
      record_key: key,
      value: current[key] ?? null,
      deleted: !(key in current),
      changed_at: Math.max(now, (next[key]?.changed_at || 0) + 1),
    };
  }
  return next;
}
export function mergeSyncRecords(local, remote) {
  const result = { ...local };
  for (const row of remote) {
    if (
      !/^(list|recent|watched|progress|settings|addons|playback)\//.test(
        row.record_key,
      )
    )
      continue;
    if (
      !result[row.record_key] ||
      row.changed_at >= result[row.record_key].changed_at
    )
      result[row.record_key] = row;
  }
  return result;
}
export function writeSyncData(
  storage,
  journal,
  notify = () => {},
  options = defaultSyncOptions,
) {
  const live = Object.values(journal).filter((row) => !row.deleted);
  for (const [kind, key] of Object.entries(syncStores)) {
    if (!syncRecordSelected(`${kind}/`, options)) continue;
    const rows = live.filter((row) => row.record_key.startsWith(`${kind}/`));
    let value;
    if (kind === "playback") {
      let existing;
      try {
        existing = JSON.parse(storage.getItem(key) || "{}");
      } catch {
        existing = {};
      }
      value = {};
      for (const row of rows
        .sort((a, b) => b.changed_at - a.changed_at)
        .slice(0, 100)) {
        const preference = cleanPlaybackPreference(row.value);
        if (!preference) continue;
        const title = row.record_key.slice(9);
        if (title.length > 480 || !/^(movie|tv):/.test(title)) continue;
        const deviceTracks = Object.fromEntries(
          Object.entries(existing[title]?.tracks || {}).filter(([key]) =>
            ["volume", "mute"].includes(key),
          ),
        );
        value[title] = {
          ...preference,
          tracks: { ...deviceTracks, ...preference.tracks },
          updatedAt: row.changed_at,
        };
      }
    } else if (kind === "settings") {
      let existing;
      try {
        existing = JSON.parse(storage.getItem(key) || "{}");
      } catch {
        existing = {};
      }
      value = { ...existing };
      for (const row of rows) {
        const name = row.record_key.slice(9);
        if (sharedSettings.has(name)) value[name] = row.value;
      }
    } else if (kind === "progress") {
      value = rows
        .sort((a, b) => b.changed_at - a.changed_at)
        .slice(0, 200)
        .map((row) => [row.record_key.slice(9), row.value]);
    } else {
      value = rows
        .sort((a, b) => b.changed_at - a.changed_at)
        .map((row) => cleanTitle(row.value))
        .filter(Boolean)
        .slice(0, kind === "recent" ? 24 : kind === "list" ? 100 : 200);
    }
    let existing;
    try {
      existing = JSON.parse(storage.getItem(key) || "null");
    } catch {
      existing = null;
    }
    if (!syncValuesEqual(existing, value)) {
      storage.setItem(key, JSON.stringify(value));
      notify(key);
    }
  }
}
