import { isDesktop } from "../platform/index.js";

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
  if (!isDesktop || !stream?.torrent) return stream;
  return {
    ...stream,
    blockedReason: "",
    isNativeTorrent: true,
    playbackTimeoutMs: 120000,
  };
}

export function withNativeMedia(stream) {
  if (!isDesktop || stream?.torrent || !stream?.url || stream.blockedReason)
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
  if (!isDesktop || (!stream?.torrent && !stream?.isNativeMedia)) {
    throw new Error(
      "Native torrent playback is available only in RainFlix Desktop.",
    );
  }
  const { invoke } = await import("@tauri-apps/api/core");
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener("abort", stop);
    invoke("stop_native_torrent", { sessionId }).catch(() => {});
  };
  signal?.addEventListener("abort", stop, { once: true });
  if (signal?.aborted) stop();

  try {
    if (stopped) throw new DOMException("Playback stopped.", "AbortError");
    onStatus?.(
      stream.isNativeMedia ? "Opening video" : "Finding torrent metadata",
    );
    const result = await invoke(
      stream.isNativeMedia ? "start_native_media" : "start_native_torrent",
      {
        sessionId,
        url: stream.isNativeMedia ? stream.url : null,
        infoHash: stream.torrent?.infoHash,
        fileIdx: stream.torrent?.fileIdx,
        sources: stream.torrent?.sources || [],
        ui: ui || null,
        startAt: Number.isFinite(resumePosition) ? resumePosition : 0,
        preloadId: stream.nativePreloadId || null,
      },
    );
    if (stopped || signal?.aborted) {
      await invoke("stop_native_torrent", { sessionId }).catch(() => {});
      throw new DOMException("Playback stopped.", "AbortError");
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
  await invoke("play_native_torrent", {
    sessionId,
    startAt: Number.isFinite(resumePosition) ? resumePosition : 0,
    ui,
  });
}
