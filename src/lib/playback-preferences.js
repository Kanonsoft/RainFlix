const key = "rainflix:playback-preferences:v1";
const appWideKeys = new Set([
  "skipIntro",
  "skipOutro",
  "nextPreview",
  "preloadNext",
  "autoNext",
]);
function titleTracks(tracks) {
  return Object.fromEntries(
    Object.entries(tracks || {}).filter(([key]) => !appWideKeys.has(key)),
  );
}

function titleKey(details) {
  const title = details.tmdbDetails || details;
  return `${title.mediaType}:${title.id || details.addonId}`;
}

export function readPlaybackPreferences(details) {
  try {
    const preference =
      JSON.parse(localStorage.getItem(key) || "{}")[titleKey(details)] || {};
    return preference.tracks
      ? { ...preference, tracks: titleTracks(preference.tracks) }
      : preference;
  } catch {
    return {};
  }
}

export function savePlaybackPreferences(details, change) {
  try {
    const values = JSON.parse(localStorage.getItem(key) || "{}");
    const id = titleKey(details);
    values[id] = { ...values[id], ...change, updatedAt: Date.now() };
    if (values[id].tracks) values[id].tracks = titleTracks(values[id].tracks);
    localStorage.setItem(
      key,
      JSON.stringify(
        Object.fromEntries(
          Object.entries(values)
            .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
            .slice(0, 100),
        ),
      ),
    );
  } catch {
    /* Device storage is optional. */
  }
}

export function streamPreference(stream) {
  // Retain quality preferences, never URLs, hashes or add-on responses.
  const label = String(stream.label || "");
  let fingerprint = 2166136261;
  for (const character of label
    .replace(/(?:\u{1F464}|seeders?[: ]*)\d+/giu, "")
    .trim())
    fingerprint = Math.imul(fingerprint ^ character.charCodeAt(0), 16777619);
  return {
    fingerprint: (fingerprint >>> 0).toString(16),
    resolution: label.match(/\b(2160|1080|720|480)p?\b/i)?.[1] || "",
    codec:
      label
        .match(/\b(hevc|h[ .]?265|x265|h[ .]?264|x264|av1)\b/i)?.[1]
        ?.toLowerCase() || "",
  };
}

export function preferredStream(streams, preference = {}) {
  return streams
    .filter((stream) => !stream.blockedReason)
    .map((stream, index) => {
      const quality = streamPreference(stream);
      return {
        stream,
        index,
        score:
          (preference.fingerprint &&
          preference.fingerprint === quality.fingerprint
            ? 8
            : 0) +
          (preference.resolution && preference.resolution === quality.resolution
            ? 2
            : 0) +
          (preference.codec && preference.codec === quality.codec ? 1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.stream;
}

function canonicalCodec(codec) {
  const value = String(codec || "")
    .toLowerCase()
    .replace(/[ .]/g, "");
  if (["hevc", "h265", "x265"].includes(value)) return "hevc";
  if (["h264", "x264"].includes(value)) return "h264";
  return value;
}

export function preferredEpisodeStream(streams, current) {
  const preference = streamPreference(current);
  const codec = canonicalCodec(preference.codec);
  // Episode continuity uses only in-memory release hints, never persisted URLs/hashes.
  const compatible = streams.filter((stream) => {
    const quality = streamPreference(stream);
    return (
      !stream.blockedReason &&
      (!preference.resolution ||
        quality.resolution === preference.resolution) &&
      (!codec || canonicalCodec(quality.codec) === codec)
    );
  });
  const sameGroup = compatible.filter(
    (stream) => current.bingeGroup && stream.bingeGroup === current.bingeGroup,
  );
  const candidates = sameGroup.length ? sameGroup : compatible;
  return (
    candidates.find(
      (stream) =>
        current.torrent?.infoHash &&
        stream.torrent?.infoHash === current.torrent.infoHash,
    ) || preferredStream(candidates, preference)
  );
}
