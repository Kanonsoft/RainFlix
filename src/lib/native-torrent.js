import { isAndroid, isDesktop, isNativeApp } from "../platform/index.js";

const androidPlayerCommands = {
  update_native_player_episodes: "update_episodes",
  update_native_player_streams: "update_streams",
  update_native_player_subtitles: "update_subtitles",
  load_native_subtitle: "load_subtitle",
  update_native_preload_status: "update_preload",
};

export async function invokeNativePlayer(command, args) {
  const { invoke } = await import("@tauri-apps/api/core");
  if (isAndroid) {
    const androidCommand = androidPlayerCommands[command];
    if (!androidCommand) throw new Error("Unsupported Android player command.");
    return invoke(`plugin:native-player|${androidCommand}`, args);
  }
  return invoke(command, args);
}

export async function listenNativePlayer(callback) {
  if (isAndroid) {
    const { addPluginListener } = await import("@tauri-apps/api/core");
    const listener = await addPluginListener(
      "native-player",
      "rainflix:native-torrent",
      (payload) => callback({ payload }),
    );
    return () => void listener.unregister().catch(() => {});
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen("rainflix:native-torrent", callback);
}

export async function prepareNativePlayerLogo(url, signal) {
  if (!url || signal?.aborted) return null;
  let bitmap;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([
        signal || new AbortController().signal,
        AbortSignal.timeout(2500),
      ]),
    });
    if (!response.ok) return null;
    bitmap = await createImageBitmap(await response.blob());
    const scale = Math.min(1, 384 / bitmap.width, 144 / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    let binary = "";
    for (let offset = 0; offset < pixels.length; offset += 8192) {
      binary += String.fromCharCode(...pixels.subarray(offset, offset + 8192));
    }
    return { width, height, data: btoa(binary) };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}

export function withNativeTorrent(stream) {
  if (!isNativeApp || !stream?.torrent) return stream;
  return {
    ...stream,
    blockedReason: "",
    isNativeTorrent: true,
    playbackTimeoutMs: 120000,
  };
}

export function withNativeMedia(stream) {
  if (!isNativeApp || stream?.torrent || !stream?.url || stream.blockedReason)
    return stream;
  try {
    if (!["http:", "https:"].includes(new URL(stream.url).protocol))
      return stream;
  } catch {
    return stream;
  }
  return { ...stream, isNativeMedia: true };
}

export async function startNativeTorrent({
  stream,
  signal,
  onStatus,
  sessionId = crypto.randomUUID(),
  ui,
  resumePosition = 0,
}) {
  if (!isNativeApp || (!stream?.torrent && !stream?.isNativeMedia)) {
    throw new Error("Native playback is available only in the RainFlix app.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  const startAt = Number.isFinite(resumePosition) ? resumePosition : 0;
  const androidUi = {
    ...ui,
    capabilities: { ...ui?.capabilities, preload: true },
  };
  const stopPlayback = () => {
    if (isAndroid)
      void invoke("plugin:native-player|stop", { sessionId }).catch(() => {});
    return invoke("stop_native_torrent", { sessionId }).catch(() => {});
  };
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", stop);
    void stopPlayback();
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();

  try {
    if (stopped) throw new DOMException("Playback stopped.", "AbortError");
    onStatus?.(
      stream.isNativeMedia ? "Opening video" : "Finding torrent metadata",
    );
    if (isAndroid) {
      await invoke("plugin:native-player|start", {
        payload: {
          sessionId,
          url: stream.isNativeMedia ? stream.url : null,
          startAt,
          ui: androidUi,
        },
      });
      if (stopped || signal?.aborted) {
        await stopPlayback();
        throw new DOMException("Playback stopped.", "AbortError");
      }
    }
    const result =
      isAndroid && stream.isNativeMedia
        ? { url: stream.url }
        : await invoke(
            stream.isNativeMedia
              ? "start_native_media"
              : "start_native_torrent",
            {
              sessionId,
              url: stream.isNativeMedia ? stream.url : null,
              infoHash: stream.torrent?.infoHash,
              fileIdx: stream.torrent?.fileIdx,
              sources: stream.torrent?.sources || [],
              preloadId: stream.nativePreloadId || null,
              ...(isDesktop
                ? {
                    ui: ui || null,
                    startAt,
                  }
                : {}),
            },
          );
    if (stopped || signal?.aborted) {
      await stopPlayback();
      throw new DOMException("Playback stopped.", "AbortError");
    }
    if (isAndroid && !stream.isNativeMedia) {
      await invoke("plugin:native-player|set_source", {
        sessionId,
        url: result.url,
        startAt,
      });
      if (stopped || signal?.aborted) {
        await stopPlayback();
        throw new DOMException("Playback stopped.", "AbortError");
      }
    }
    return { sessionId, url: result.url, destroy: stop };
  } catch (error) {
    stop();
    if (signal?.aborted) {
      throw new DOMException("Playback stopped.", "AbortError");
    }
    throw new Error(String(error?.message || error), { cause: error });
  }
}

export async function playNativeTorrent(
  sessionId,
  resumePosition = 0,
  ui = {},
) {
  const { invoke } = await import("@tauri-apps/api/core");
  if (isAndroid)
    throw new Error(
      "Android playback starts through the native-player plugin.",
    );
  await invoke("play_native_torrent", {
    sessionId,
    startAt: Number.isFinite(resumePosition) ? resumePosition : 0,
    ui,
  });
}
