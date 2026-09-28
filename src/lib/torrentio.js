import { config } from "./api.js";
import {
  addonFetch,
  addonStreamList,
  normalizeHttpStream,
  normalizeSubtitles,
  streamLabel,
} from "./addon-streams.js";

export function torrentioBaseUrl(settings = config.torrentio) {
  let address = String(settings?.manifestUrl || settings?.baseUrl || "").trim();
  // Torrentio's install button exports a stremio:// manifest URL.
  address = address.replace(/^stremio:\/\//i, "https://");
  const url = new URL(address);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Torrentio needs an HTTP or HTTPS address.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/(?:manifest\.json|configure)\/?$/, "");
  return url.href.replace(/\/+$/, "");
}

export function torrentioResourceUrl(details, season = 1, episode = 1) {
  const imdbId = String(details.imdbId || "").trim();
  if (!/^tt\d+$/.test(imdbId)) {
    throw new Error(
      "Torrentio needs an IMDb ID. TMDb has no IMDb match for this title.",
    );
  }
  const type = details.mediaType === "tv" ? "series" : "movie";
  const number = (value) => Math.max(1, Number.parseInt(value, 10) || 1);
  const id = `${imdbId}${type === "series" ? `:${number(season)}:${number(episode)}` : ""}`;
  return `${torrentioBaseUrl()}/stream/${type}/${encodeURIComponent(id)}.json`;
}

export function torrentSource(raw, index) {
  if (
    typeof raw?.infoHash !== "string" ||
    !/^[a-f0-9]{40}$/i.test(raw.infoHash)
  )
    return null;
  const hash = raw.infoHash.toLowerCase();
  const fileIdx =
    Number.isInteger(raw.fileIdx) && raw.fileIdx >= 0 ? raw.fileIdx : null;
  const magnet = new URL("magnet:");
  magnet.searchParams.set("xt", `urn:btih:${hash}`);
  if (raw.behaviorHints?.filename)
    magnet.searchParams.set("dn", raw.behaviorHints.filename);
  if (fileIdx !== null) magnet.searchParams.set("so", String(fileIdx));
  const trackers = new Set();
  const dhtSources = new Set();
  for (const source of Array.isArray(raw.sources) ? raw.sources : []) {
    if (typeof source === "string" && /^dht:[a-f0-9]{40}$/i.test(source))
      dhtSources.add(source.toLowerCase());
    if (typeof source !== "string" || !source.startsWith("tracker:")) continue;
    try {
      const tracker = new URL(source.slice(8));
      if (["http:", "https:", "udp:", "ws:", "wss:"].includes(tracker.protocol))
        trackers.add(tracker.href);
    } catch {
      /* Ignore malformed upstream trackers. */
    }
  }
  for (const tracker of trackers) magnet.searchParams.append("tr", tracker);
  return {
    id: String(index),
    torrentKey: `${hash}:${fileIdx ?? "largest"}`,
    torrent: {
      infoHash: hash,
      fileIdx,
      sources: [...trackers]
        .map((tracker) => `tracker:${tracker}`)
        .concat([...dhtSources]),
    },
    label: `${streamLabel(raw, index)} [Torrent]`,
    blockedReason:
      "Choose Browser WebTorrent or Stremio Service for in-page playback, or open this torrent externally.",
    externalUrl: magnet.href,
    subtitles: normalizeSubtitles(raw.subtitles),
  };
}

export async function getTorrentioStreams(details, season, episode, signal) {
  const data = await addonFetch(
    torrentioResourceUrl(details, season, episode),
    signal,
    {
      label: "Torrentio",
      timeoutMs: config.torrentio?.requestTimeoutMs,
    },
  );
  const seen = new Set();
  return addonStreamList(data, "Torrentio").flatMap((raw, index) => {
    const stream =
      normalizeHttpStream(raw, index, "Torrentio") || torrentSource(raw, index);
    if (!stream) return [];
    const key = stream.url || stream.torrentKey;
    if (seen.has(key)) return [];
    seen.add(key);
    // Resolving a debrid URL can enqueue a download. Only load it after an explicit click.
    return [{ ...stream, requiresStart: true }];
  });
}
