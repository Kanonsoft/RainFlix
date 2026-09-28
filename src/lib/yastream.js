import { config } from "./api.js";
import {
  addonFetch,
  addonStreamList,
  normalizeHttpStream,
  normalizeSubtitles,
} from "./addon-streams.js";

export function yastreamBaseUrl(settings = config.yastream) {
  const override = String(settings?.manifestUrl || "").trim();
  const url = new URL(override || settings?.baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Yastream needs an HTTP or HTTPS address.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/(?:manifest\.json|configure)\/?$/, "");
  url.pathname = url.pathname.replace(/\/+$/, "");

  if (!override && settings.options) {
    const bytes = new TextEncoder().encode(JSON.stringify(settings.options));
    const encoded = btoa(
      Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""),
    );
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${encodeURIComponent(encoded)}`;
  }
  return url.href.replace(/\/+$/, "");
}

export function yastreamResourceUrl(
  resource,
  details,
  season = 1,
  episode = 1,
) {
  if (!/^\d+$/.test(String(details.id))) {
    throw new Error("This title has no valid TMDb ID.");
  }
  const type = details.mediaType === "tv" ? "series" : "movie";
  const number = (value) => Math.max(1, Number.parseInt(value, 10) || 1);
  const id = `tmdb:${details.id}${type === "series" ? `:${number(season)}:${number(episode)}` : ""}`;
  return `${yastreamBaseUrl()}/${resource}/${type}/${encodeURIComponent(id)}.json`;
}

function yastreamFetch(url, signal) {
  return addonFetch(url, signal, {
    label: "Yastream",
    timeoutMs: config.yastream?.requestTimeoutMs,
  });
}

export async function getYastreamStreams(details, season, episode, signal) {
  const data = await yastreamFetch(
    yastreamResourceUrl("stream", details, season, episode),
    signal,
  );
  const seen = new Set();
  return addonStreamList(data, "Yastream").flatMap((raw, index) => {
    const stream = normalizeHttpStream(raw, index, "Yastream");
    if (!stream || seen.has(stream.url)) return [];
    seen.add(stream.url);
    return [stream];
  });
}

export async function getYastreamSubtitles(details, season, episode, signal) {
  const data = await yastreamFetch(
    yastreamResourceUrl("subtitles", details, season, episode),
    signal,
  );
  return normalizeSubtitles(data?.subtitles);
}
