import { config } from "./api.js";
import { registerRainFlixServiceWorker } from "./service-worker.js";

const PLAYBACK_MODE_KEY = "rainflix:torrent-playback:v1";
const PLAYBACK_MODES = new Set(["browser", "stremio", "external"]);
const VIDEO_EXTENSION = /\.(?:m4v|mkv|mov|mp4|og[gv]|webm)$/i;
let webTorrentModule;

function abortError() {
  return new DOMException(
    "Browser torrent playback was stopped.",
    "AbortError",
  );
}

function loadWebTorrent() {
  if (!webTorrentModule) {
    const moduleUrl = new URL(
      `${import.meta.env.BASE_URL}webtorrent.min.js`,
      window.location.origin,
    );
    webTorrentModule = import(/* @vite-ignore */ moduleUrl.href).catch(
      (error) => {
        webTorrentModule = undefined;
        throw error;
      },
    );
  }
  return webTorrentModule;
}

function browserTrackers(stream) {
  const trackers = [
    ...(stream.torrent?.sources || [])
      .filter((source) => source.startsWith("tracker:"))
      .map((source) => source.slice(8)),
    ...(config.webTorrent?.trackers || []),
  ];

  return [...new Set(trackers)].filter((address) => {
    try {
      const url = new URL(address);
      return (
        url.protocol === "wss:" ||
        (url.protocol === "ws:" && window.location.protocol === "http:")
      );
    } catch {
      return false;
    }
  });
}

function browserMagnet(stream) {
  const parameters = [`xt=urn:btih:${stream.torrent.infoHash}`];

  try {
    const external = new URL(stream.externalUrl);
    const name = external.searchParams.get("dn");
    if (name) parameters.push(`dn=${encodeURIComponent(name)}`);
  } catch {
    // The validated info hash is enough to construct a safe magnet.
  }

  for (const tracker of browserTrackers(stream)) {
    parameters.push(`tr=${encodeURIComponent(tracker)}`);
  }
  // WebTorrent rejects an encoded `urn%3Abtih%3A` exact-topic value.
  return `magnet:?${parameters.join("&")}`;
}

function selectVideoFile(torrent, fileIdx) {
  if (Number.isInteger(fileIdx)) {
    if (!torrent.files[fileIdx]) {
      throw new Error("The selected torrent file is unavailable.");
    }
    const selected = torrent.files[fileIdx];
    if (!VIDEO_EXTENSION.test(selected.name)) {
      throw new Error(
        "The selected torrent file is not a browser-supported video container.",
      );
    }
    return selected;
  }

  return torrent.files
    .filter((file) => VIDEO_EXTENSION.test(file.name))
    .sort((left, right) => right.length - left.length)[0];
}

function formatSpeed(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 KB/s";
  if (bytesPerSecond < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytesPerSecond / 1024))} KB/s`;
  }
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`;
}

export function readTorrentPlaybackMode() {
  const fallback = config.webTorrent?.enabled
    ? "browser"
    : config.stremioService?.enabled
      ? "stremio"
      : "external";
  try {
    const stored = localStorage.getItem(PLAYBACK_MODE_KEY);
    if (stored === "browser" && config.webTorrent?.enabled === false) {
      return fallback;
    }
    return PLAYBACK_MODES.has(stored) ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function saveTorrentPlaybackMode(mode) {
  if (!PLAYBACK_MODES.has(mode)) return;
  try {
    localStorage.setItem(PLAYBACK_MODE_KEY, mode);
  } catch {
    // The selection remains active for this page when storage is unavailable.
  }
}

export function withBrowserTorrent(stream) {
  if (!stream?.torrent) return stream;
  return {
    ...stream,
    blockedReason: "",
    isWebTorrent: true,
    playbackTimeoutMs: config.webTorrent?.playbackTimeoutMs || 75000,
  };
}

export async function startBrowserTorrent({ stream, video, signal, onStatus }) {
  let client;
  let metadataTimer;
  let activeFile;
  let settled = false;

  const destroy = () => {
    window.clearTimeout(metadataTimer);
    if (client && !client.destroyed) {
      try {
        client.destroy(() => {});
      } catch {
        // The client may already be closing after a torrent error.
      }
    }
  };

  try {
    onStatus("Preparing browser torrent");
    const [{ default: WebTorrent }, registration] = await Promise.all([
      loadWebTorrent(),
      registerRainFlixServiceWorker(),
    ]);
    if (signal.aborted) throw abortError();
    if (!WebTorrent.WEBRTC_SUPPORT) {
      throw new Error("This browser does not support WebRTC torrent peers.");
    }

    const configuredUploadLimit = Number(config.webTorrent?.uploadLimitBps);
    client = new WebTorrent({
      maxConns: Math.max(1, Number(config.webTorrent?.maxConns) || 40),
      uploadLimit:
        Number.isFinite(configuredUploadLimit) && configuredUploadLimit >= -1
          ? configuredUploadLimit
          : -1,
    });
    client.createServer({ controller: registration }, "browser");
    signal.addEventListener("abort", destroy, { once: true });

    return await new Promise((resolve, reject) => {
      const fail = (error) => {
        if (settled) return;
        settled = true;
        destroy();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const metadataTimeout =
        Number(config.webTorrent?.metadataTimeoutMs) || 35000;
      metadataTimer = window.setTimeout(
        () =>
          fail(
            new Error(
              "No WebRTC peers supplied torrent metadata. Try another stream or use Stremio Service.",
            ),
          ),
        metadataTimeout,
      );
      signal.addEventListener("abort", () => fail(abortError()), {
        once: true,
      });
      client.once("error", fail);
      onStatus("Finding WebRTC peers");

      const torrent = client.add(
        browserMagnet(stream),
        {
          deselect: true,
          destroyStoreOnDestroy: true,
          strategy: "sequential",
        },
        (readyTorrent) => {
          if (signal.aborted) {
            fail(abortError());
            return;
          }
          window.clearTimeout(metadataTimer);
          try {
            activeFile = selectVideoFile(readyTorrent, stream.torrent.fileIdx);
            if (!activeFile) {
              throw new Error(
                "This torrent does not contain a browser-supported video file.",
              );
            }
            for (const item of readyTorrent.files) item.deselect();
            activeFile.streamTo(video);
            video.load();
            video.play().catch(() => {});
            onStatus(`Buffering ${activeFile.name}`);
            settled = true;
            resolve({ destroy, file: activeFile, torrent: readyTorrent });
          } catch (error) {
            fail(error);
          }
        },
      );

      torrent.on("wire", () => {
        onStatus(
          `Connected to ${torrent.numPeers} WebRTC peer${torrent.numPeers === 1 ? "" : "s"}`,
        );
      });
      torrent.on("noPeers", () => onStatus("Waiting for WebRTC peers"));
      torrent.on("download", () => {
        const progress = Math.round(
          (activeFile?.progress || torrent.progress) * 100,
        );
        onStatus(
          `Buffering ${progress}% | ${formatSpeed(torrent.downloadSpeed)} | ${torrent.numPeers} peer${torrent.numPeers === 1 ? "" : "s"}`,
        );
      });
      torrent.once("error", fail);
    });
  } catch (error) {
    destroy();
    throw error;
  }
}
