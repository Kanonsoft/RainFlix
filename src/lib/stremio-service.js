import { config } from "./api.js";
import { addonFetch } from "./addon-streams.js";

const STORAGE_KEY = "rainflix:stremio-service:v1";

export function normalizeServiceUrl(
  value,
  pageProtocol = window.location.protocol,
) {
  let url;
  try {
    url = new URL(String(value || "").trim());
  } catch (error) {
    throw new Error("Enter a complete Stremio Service HTTP or HTTPS address.", {
      cause: error,
    });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Use an HTTP or HTTPS service address without credentials, query parameters, or a fragment.",
    );
  }
  const loopback =
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname === "[::1]" ||
    /^127\./.test(url.hostname);
  if (pageProtocol === "https:" && url.protocol === "http:" && !loopback) {
    throw new Error(
      "An HTTPS page needs an HTTPS service address, except for localhost.",
    );
  }
  return url.href.replace(/\/+$/, "");
}

export function readServiceConnection() {
  const defaults = {
    enabled: config.stremioService?.enabled === true,
    baseUrl: config.stremioService?.baseUrl || "http://127.0.0.1:11470",
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      typeof stored?.enabled === "boolean" &&
      typeof stored.baseUrl === "string"
    ) {
      return {
        enabled: stored.enabled,
        baseUrl: normalizeServiceUrl(stored.baseUrl),
      };
    }
  } catch {
    /* Invalid or unavailable storage falls back to runtime configuration. */
  }
  return defaults;
}

export function saveServiceConnection(connection) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connection));
  } catch {
    /* Connection changes still work when browser storage is unavailable. */
  }
}

export async function checkStremioService(baseUrl, signal) {
  const url = normalizeServiceUrl(baseUrl);
  const data = await addonFetch(`${url}/settings`, signal, {
    label: "Stremio Service",
    timeoutMs: config.stremioService?.checkTimeoutMs || 5000,
  });
  if (
    typeof data?.values?.serverVersion !== "string" ||
    !data.values.serverVersion
  ) {
    throw new Error("This address did not return Stremio Service settings.");
  }
  return { version: data.values.serverVersion };
}

export function withStremioService(stream, connection) {
  if (!stream?.torrent || !connection.enabled) return stream;
  try {
    const baseUrl = normalizeServiceUrl(connection.baseUrl);
    const { infoHash, fileIdx, sources } = stream.torrent;
    // Stremio uses -1 to select the largest file when the add-on omits an index.
    const url = new URL(`${baseUrl}/${infoHash}/${fileIdx ?? -1}`);
    for (const source of sources) url.searchParams.append("tr", source);
    return {
      ...stream,
      url: url.href,
      blockedReason: "",
      isStremio: true,
      playbackTimeoutMs: config.stremioService?.playbackTimeoutMs || 60000,
    };
  } catch (error) {
    return { ...stream, blockedReason: error.message };
  }
}
