import { useEffect, useMemo, useRef, useState } from "react";
import { Captions, Check, Play, RefreshCw } from "lucide-react";
import { parse } from "@plussub/srt-vtt-parser";
import { addonFetch, groupSubtitlesByLanguage } from "../lib/addon-streams.js";
import { startBrowserTorrent } from "../lib/browser-torrent.js";
import {
  startNativeTorrent,
  invokeNativePlayer,
  listenNativePlayer,
} from "../lib/native-torrent.js";
import rainflixLogo from "../../assets/rainflix-r.png";
import { installedSubtitles, useAddons } from "../lib/addons.js";
import PlaybackLoader from "./PlaybackLoader.jsx";
import { streamPresentation } from "../lib/stream-presentation.js";
import {
  nativeTrackSettings,
  readAppSettings,
  savePlayerSkipSettings,
} from "../lib/app-settings.js";
import { isAndroid } from "../platform/index.js";

function bufferedReadiness(video) {
  if (!video.readyState || !Number.isFinite(video.duration)) return null;
  const position = video.currentTime;
  // This measures the next playable buffer, not the whole file's download progress.
  const target = Math.min(8, Math.max(0.1, video.duration - position));
  for (let index = 0; index < video.buffered.length; index++) {
    if (
      video.buffered.start(index) <= position &&
      video.buffered.end(index) >= position
    )
      return Math.min(1, (video.buffered.end(index) - position) / target);
  }
  return 0;
}

function subtitleKey(item) {
  let value = 2166136261;
  for (const character of item.url)
    value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return `sub-${(value >>> 0).toString(16)}`;
}

function StreamVideo({
  stream,
  title,
  poster,
  logo,
  subtitles,
  subtitleLookupError,
  onStarted,
  onProgress,
  onEnded,
  resumePosition = 0,
  onRetry,
  provider,
  settings,
  autoStart = false,
  fullscreen = false,
  preferences,
  onPreferences,
}) {
  const videoRef = useRef(null);
  const captionRef = useRef(null);
  const callbacks = useRef({ onStarted, onProgress, onEnded });
  const [loading, setLoading] = useState(!stream.blockedReason);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [bufferProgress, setBufferProgress] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState("Loading stream");
  const [error, setError] = useState(stream.blockedReason);
  const [subtitleUrl, setSubtitleUrl] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const captionsButton = useRef(null);
  const [started, setStarted] = useState(autoStart || !stream.requiresStart);
  const restoredCaption = useRef(false);
  const currentPreferences = useRef(preferences?.tracks || {});
  useEffect(() => {
    if (restoredCaption.current || !subtitles.length) return;
    restoredCaption.current = true;
    const saved = currentPreferences.current.sub;
    if (!saved || saved.off) return;
    const selected = subtitles.find(
      (item) => item.lang === saved.lang || item.label === saved.label,
    );
    if (selected) setSubtitleUrl(selected.url);
  }, [subtitles]);
  const frameClass = fullscreen
    ? "relative h-full min-h-0 w-full overflow-hidden bg-black"
    : "relative aspect-video w-full overflow-hidden bg-black";

  useEffect(() => {
    callbacks.current = { onStarted, onProgress, onEnded };
  }, [onStarted, onProgress, onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || stream.blockedReason || !started) return undefined;
    let cancelled = false;
    let hls;
    let browserSession;
    const torrentController = new AbortController();
    let timer;
    let failed = false;
    let mediaReady = false;
    let recoveredMedia = false;
    let played = false;
    let completed = false;
    let resumePending = Number.isFinite(resumePosition) && resumePosition > 0;
    let lastSample;
    const restorePosition = () => {
      if (
        !resumePending ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return;
      try {
        video.currentTime =
          resumePosition < video.duration ? resumePosition : 0;
        resumePending = false;
      } catch {
        // Some engines expose duration before seeking is ready; retry on canplay.
      }
    };
    const savePosition = (flush = false) => {
      if (!played) return;
      if (
        !resumePending &&
        !video.seeking &&
        video.readyState > 0 &&
        Number.isFinite(video.duration) &&
        video.duration > 0
      ) {
        lastSample = {
          position: video.currentTime,
          duration: video.duration,
          completed: completed || video.ended,
        };
      }
      if (lastSample) callbacks.current.onProgress?.(lastSample, flush);
    };
    const timeUpdate = () => savePosition();
    const flushPosition = () => savePosition(true);
    const visibilityChange = () => {
      if (document.visibilityState === "hidden") flushPosition();
    };
    const playing = () => {
      if (cancelled || failed) return;
      restorePosition();
      played = true;
      setHasPlayed(true);
      completed = false;
      callbacks.current.onStarted?.();
      savePosition();
    };
    const ended = () => {
      if (cancelled || failed || completed || !played) return;
      completed = true;
      flushPosition();
      callbacks.current.onEnded?.();
    };
    const updateProgress = () => {
      if (!cancelled && !failed) setBufferProgress(bufferedReadiness(video));
    };
    const fail = (reason) => {
      if (cancelled || failed) return;
      failed = true;
      window.clearTimeout(timer);
      hls?.destroy();
      torrentController.abort();
      browserSession?.destroy();
      video.pause();
      setLoading(false);
      const message =
        reason instanceof Error
          ? reason.message
          : typeof reason === "string"
            ? reason
            : "";
      setError(
        message ||
          (stream.isStremio
            ? "Stremio could not play this torrent. Check the service, available peers, and browser codec support."
            : stream.isWebTorrent
              ? "The browser could not play this torrent file. Try another stream or use Stremio Service."
              : "This stream could not play. Retry or choose another stream."),
      );
    };
    const ready = () => {
      if (cancelled || failed) return;
      mediaReady = true;
      window.clearTimeout(timer);
      updateProgress();
      setLoading(false);
    };
    const waiting = () => {
      if (cancelled || failed) return;
      window.clearTimeout(timer);
      setLoading(true);
      updateProgress();
      setLoadingMessage("Buffering stream");
      timer = window.setTimeout(
        fail,
        Number(stream.playbackTimeoutMs || settings.playbackTimeoutMs) || 25000,
      );
    };
    video.addEventListener("loadedmetadata", restorePosition);
    video.addEventListener("durationchange", restorePosition);
    video.addEventListener("canplay", restorePosition);
    video.addEventListener("playing", playing);
    video.addEventListener("timeupdate", timeUpdate);
    video.addEventListener("pause", flushPosition);
    video.addEventListener("seeked", flushPosition);
    video.addEventListener("ended", ended);
    window.addEventListener("pagehide", flushPosition);
    document.addEventListener("visibilitychange", visibilityChange);
    video.addEventListener("progress", updateProgress);
    video.addEventListener("loadedmetadata", updateProgress);
    video.addEventListener("durationchange", updateProgress);
    video.addEventListener("playing", ready);
    video.addEventListener("canplay", ready);
    video.addEventListener("waiting", waiting);
    video.addEventListener("error", fail);
    waiting();

    const attach = async () => {
      if (stream.isWebTorrent) {
        browserSession = await startBrowserTorrent({
          stream,
          video,
          signal: torrentController.signal,
          onStatus: (message) => {
            if (cancelled || failed || mediaReady) return;
            setLoading(true);
            setLoadingMessage(message);
          },
        });
        return;
      }
      const isHls = /\.m3u8(?:$|[?#])/i.test(stream.url);
      if (isHls) {
        const { default: Hls } = await import("hls.js");
        if (cancelled || failed) return;
        if (!Hls.isSupported()) {
          if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = stream.url;
            video.load();
          } else {
            fail();
          }
          return;
        }
        hls = new Hls({ maxBufferLength: 30, backBufferLength: 30 });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia) {
            recoveredMedia = true;
            hls.recoverMediaError();
          } else {
            fail();
          }
        });
        hls.loadSource(stream.url);
        hls.attachMedia(video);
      } else {
        video.src = stream.url;
        video.load();
      }
    };
    attach().catch(fail);

    return () => {
      flushPosition();
      cancelled = true;
      torrentController.abort();
      window.clearTimeout(timer);
      video.removeEventListener("loadedmetadata", restorePosition);
      video.removeEventListener("durationchange", restorePosition);
      video.removeEventListener("canplay", restorePosition);
      video.removeEventListener("playing", playing);
      video.removeEventListener("timeupdate", timeUpdate);
      video.removeEventListener("pause", flushPosition);
      video.removeEventListener("seeked", flushPosition);
      video.removeEventListener("ended", ended);
      window.removeEventListener("pagehide", flushPosition);
      document.removeEventListener("visibilitychange", visibilityChange);
      video.removeEventListener("progress", updateProgress);
      video.removeEventListener("loadedmetadata", updateProgress);
      video.removeEventListener("durationchange", updateProgress);
      video.removeEventListener("playing", ready);
      video.removeEventListener("canplay", ready);
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("error", fail);
      hls?.destroy();
      browserSession?.destroy();
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [stream, started, settings.playbackTimeoutMs, resumePosition]);

  useEffect(() => {
    const video = videoRef.current;
    setSubtitleError("");
    if (!video || !subtitleUrl) return undefined;
    const controller = new AbortController();
    const subtitle = subtitles.find((item) => item.url === subtitleUrl);
    const track =
      captionRef.current || video.addTextTrack("subtitles", provider.label);
    captionRef.current = track;
    for (const other of video.textTracks) other.mode = "disabled";
    track.mode = "hidden";

    addonFetch(subtitleUrl, controller.signal, {
      label: provider.label,
      timeoutMs: settings.requestTimeoutMs,
      asText: true,
    })
      .then((text) => {
        if (controller.signal.aborted) return;
        const { entries } = parse(text);
        if (!entries.length) throw new Error("No captions");
        for (const { from, to, text: cueText } of entries) {
          if (to > from)
            track.addCue(new VTTCue(from / 1000, to / 1000, cueText));
        }
        track.mode = "showing";
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSubtitleError(
            `${subtitle?.label || "Selected subtitles"} could not load.`,
          );
        }
      });

    return () => {
      controller.abort();
      track.mode = "disabled";
      while (track.cues?.length) track.removeCue(track.cues[0]);
    };
  }, [
    subtitleUrl,
    subtitles,
    provider.label,
    settings.requestTimeoutMs,
    started,
  ]);

  if (stream.blockedReason) {
    return (
      <div className={frameClass}>
        <PlayerMessage message={stream.blockedReason} />
      </div>
    );
  }

  if (!started) {
    return (
      <div className={frameClass}>
        {poster ? (
          <img
            src={poster}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-sky-400 px-5 font-bold text-slate-950 hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
            {stream.isWebTorrent ? "Play in browser" : "Play stream"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={frameClass}>
        {loading && !hasPlayed && poster && (
          <img
            src={poster}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <video
          ref={videoRef}
          className={`h-full w-full object-contain ${loading || error ? "invisible" : ""}`}
          controls={!loading && !error}
          autoPlay={autoStart || stream.requiresStart}
          playsInline
          preload="auto"
          poster={poster}
          tabIndex={loading || error ? -1 : 0}
          aria-label={`${title} ${provider.label} player`}
          onKeyDown={(event) => {
            // Keep native playback shortcuts within the video, away from page navigation.
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(
                event.key,
              )
            ) {
              event.stopPropagation();
            }
          }}
        />
        <PlaybackLoader
          active={loading && !error}
          title={title}
          logo={logo}
          progress={bufferProgress}
          message={loadingMessage}
        />
        {error ? <PlayerMessage message={error} onRetry={onRetry} /> : null}
        {!loading &&
          !error &&
          (subtitles.length > 0 || subtitleLookupError) && (
            <div
              className="absolute left-3 top-3 z-30"
              onKeyDown={(event) => {
                if (event.key === "Escape" && captionsOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  setCaptionsOpen(false);
                  captionsButton.current?.focus();
                }
              }}
            >
              <button
                ref={captionsButton}
                className="player-overlay-control grid h-11 w-11 place-items-center rounded-lg bg-black/75 text-white focus-visible:ring-2 focus-visible:ring-sky-400"
                type="button"
                aria-label="Subtitles"
                title="Subtitles"
                aria-expanded={captionsOpen}
                aria-controls="playerCaptions"
                onClick={() => setCaptionsOpen((open) => !open)}
              >
                <Captions className="h-5 w-5" aria-hidden="true" />
              </button>
              {captionsOpen && (
                <div
                  id="playerCaptions"
                  role="group"
                  aria-label="Subtitles"
                  className="mt-2 max-h-[calc(100dvh-8rem)] w-56 max-w-[calc(100vw-6rem)] overflow-y-auto rounded-lg border border-white/20 bg-neutral-950/95 p-2 shadow-xl"
                >
                  <p className="px-3 py-2 text-xs font-bold text-slate-400">
                    Subtitles
                  </p>
                  {[
                    { url: "", label: "Off" },
                    ...groupSubtitlesByLanguage(subtitles).flatMap((group) => [
                      { heading: group.name },
                      ...group.tracks,
                    ]),
                  ].map((subtitle) =>
                    subtitle.heading ? (
                      <p
                        key={subtitle.heading}
                        className="px-3 pb-1 pt-3 text-xs font-bold text-slate-400"
                      >
                        {subtitle.heading}
                      </p>
                    ) : (
                      <button
                        type="button"
                        key={subtitle.url}
                        aria-pressed={subtitleUrl === subtitle.url}
                        className="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
                        onClick={() => {
                          setSubtitleUrl(subtitle.url);
                          const tracks = {
                            ...currentPreferences.current,
                            sub: subtitle.url
                              ? {
                                  lang: subtitle.lang || "und",
                                  label: subtitle.label,
                                }
                              : { off: true },
                          };
                          currentPreferences.current = tracks;
                          onPreferences?.(tracks);
                          setCaptionsOpen(false);
                          captionsButton.current?.focus();
                        }}
                      >
                        <span className="flex-1 break-words">
                          {subtitle.label}
                        </span>
                        {subtitleUrl === subtitle.url && (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    ),
                  )}
                  {(subtitleError || subtitleLookupError) && (
                    <p className="p-3 text-xs text-amber-200" role="status">
                      {subtitleError || "Some subtitles could not be loaded."}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
      </div>
    </>
  );
}

function PlayerMessage({ message, onRetry }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-slate-950/95 p-4 text-center"
      role="status"
    >
      <p className="max-w-md text-base text-slate-300">{message}</p>
      {onRetry ? (
        <button
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-sky-500/60 px-4 text-sm font-bold text-sky-200 hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          type="button"
          onClick={onRetry}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

function NativeTorrentPlayer({
  stream,
  title,
  logo,
  resumePosition,
  onStarted,
  onProgress,
  onEnded,
  onClose,
  onRetry,
  season,
  episode,
  episodes,
  streamProviders,
  currentVideoId,
  onEpisodeSelect,
  onResolveEpisodeStreams,
  onResolvePreload,
  onLoadSeason,
  episodeTitle,
  poster,
  seasons,
  preferences,
  onPreferences,
  subtitles,
  subtitleLookupError,
}) {
  const callbacks = useRef({
    onStarted,
    onProgress,
    onEnded,
    onClose,
    onEpisodeSelect,
    onResolveEpisodeStreams,
    onResolvePreload,
    onLoadSeason,
    episodes,
    onPreferences,
    subtitles,
  });
  const initialEpisodes = useRef(episodes);
  const initialUi = useRef({
    seasons,
    preferences,
    title,
    episodeTitle,
    logo,
    poster,
    streamProviders,
  });
  const [nativeSessionId, setNativeSessionId] = useState(null);
  const [nativePlaying, setNativePlaying] = useState(false);
  const autoSubtitle = useRef(false);
  const episodeRevision = useRef(Date.now());
  const drawerSeason = useRef(season);
  useEffect(() => {
    if (!nativeSessionId) return;
    import("@tauri-apps/api/core")
      .then(() =>
        invokeNativePlayer("update_native_player_subtitles", {
          sessionId: nativeSessionId,
          subtitles: subtitles.map((item) => ({
            id: subtitleKey(item),
            label: item.label,
            lang: item.lang || item.language || "und",
          })),
          failed: subtitleLookupError,
        }),
      )
      .catch(() => {});
  }, [nativeSessionId, subtitles, subtitleLookupError]);
  useEffect(() => {
    if (!nativeSessionId || !nativePlaying || autoSubtitle.current) return;
    const saved = initialUi.current.preferences?.tracks?.sub;
    if (!saved || saved.off) {
      autoSubtitle.current = true;
      return;
    }
    const index = subtitles.findIndex(
      (item) =>
        item.label === saved.title &&
        (item.lang || item.language) === saved.lang,
    );
    if (index < 0) return;
    autoSubtitle.current = true;
    const item = subtitles[index];
    import("@tauri-apps/api/core")
      .then(() =>
        invokeNativePlayer("load_native_subtitle", {
          sessionId: nativeSessionId,
          id: subtitleKey(item),
          url: item.url,
          label: item.label,
          lang: item.lang || item.language || "und",
        }),
      )
      .catch(() => {});
  }, [nativeSessionId, nativePlaying, subtitles]);
  useEffect(() => {
    if (!nativeSessionId) return;
    import("@tauri-apps/api/core")
      .then(() =>
        invokeNativePlayer("update_native_player_episodes", {
          sessionId: nativeSessionId,
          revision: ++episodeRevision.current,
          season: drawerSeason.current,
          status: null,
          episodes: (episodes || []).map((item) => ({
            id: String(item.id),
            season: item.season ?? null,
            episode: item.episode ?? null,
            title: item.title || "Episode",
            date: item.date || null,
            image: null,
            imageUrl: item.image || null,
          })),
        }),
      )
      .catch(() => {});
  }, [nativeSessionId, episodes, season]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(
    "Finding torrent metadata",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    callbacks.current = {
      onStarted,
      onProgress,
      onEnded,
      onClose,
      onEpisodeSelect,
      onResolveEpisodeStreams,
      onResolvePreload,
      onLoadSeason,
      episodes,
      onPreferences,
      subtitles,
    };
  }, [
    onStarted,
    onProgress,
    onEnded,
    onClose,
    onEpisodeSelect,
    onResolveEpisodeStreams,
    onResolvePreload,
    onLoadSeason,
    episodes,
    onPreferences,
    subtitles,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let session;
    const sessionId = crypto.randomUUID();
    let choiceController;
    let seasonController;
    let choices = [];
    let unlisten;
    let played = false;
    let ended = false;
    let advancing = false;
    let lastSample;
    let preload;
    const reportPreload = async (current, status, percent = 0) => {
      if (cancelled || current.claimed) return;
      await invokeNativePlayer("update_native_preload_status", {
        sessionId,
        preloadId: current.id,
        status,
        percent,
      }).catch(() => {});
    };
    const cancelPreload = () => {
      const current = preload;
      preload = null;
      current?.controller.abort();
      if (current && !current.claimed) void reportPreload(current, "cancelled");
      if (current && !current.claimed)
        import("@tauri-apps/api/core")
          .then(({ invoke }) =>
            invoke("control_native_preload", {
              sessionId,
              preloadId: current.id,
              claim: false,
            }),
          )
          .catch(() => {});
    };
    const takePreload = async (videoId) => {
      const current = preload;
      if (
        !(current?.ready || current?.prepared) ||
        current.claimed ||
        current.claiming ||
        current.videoId !== videoId ||
        cancelled
      )
        return false;
      current.claiming = true;
      const { invoke } = await import("@tauri-apps/api/core");
      if (cancelled || preload !== current) return false;
      const claimed = await invoke("control_native_preload", {
        sessionId,
        preloadId: current.id,
        claim: true,
      });
      if (!claimed || cancelled || preload !== current) {
        cancelPreload();
        return false;
      }
      current.claimed = true;
      const accepted = callbacks.current.onEpisodeSelect?.(videoId, false, {
        ...current.choice,
        stream: { ...current.choice.stream, nativePreloadId: current.id },
      });
      return accepted !== false;
    };
    const advanceEpisode = (videoId, complete = false) => {
      if (advancing || cancelled) return;
      advancing = true;
      let handedOff = false;
      (videoId ? takePreload(videoId) : Promise.resolve(false))
        .catch(() => false)
        .then(async (continued) => {
          if (continued || cancelled) {
            handedOff = continued;
            return;
          }
          if (videoId && (stream.isNativeTorrent || stream.isNativeMedia)) {
            const choice = await callbacks.current.onResolvePreload?.(
              videoId,
              controller.signal,
            );
            if (cancelled) return;
            if (!choice && isAndroid)
              throw new Error(
                "No matching stream. Choose a source for this episode.",
              );
            const accepted = callbacks.current.onEpisodeSelect?.(
              videoId,
              false,
              choice || undefined,
            );
            if (accepted === false)
              throw new Error("This episode could not be opened. Try again.");
            handedOff = true;
            return;
          }
          if (complete) {
            if (callbacks.current.onEnded) await callbacks.current.onEnded();
            else callbacks.current.onClose?.();
            handedOff = true;
          } else
            handedOff =
              callbacks.current.onEpisodeSelect?.(videoId, true) !== false;
        })
        .catch(async (error) => {
          if (cancelled || !videoId) return;
          if (isAndroid)
            await invokeNativePlayer("update_native_navigation_status", {
              sessionId,
              videoId,
              status: "error",
              message:
                error.message || "Could not open this episode. Try again.",
            }).catch(() => {});
          else
            handedOff =
              callbacks.current.onEpisodeSelect?.(videoId, false) !== false;
        })
        .finally(() => {
          if (!handedOff && !cancelled) advancing = false;
        });
    };
    const fail = (reason) => {
      if (cancelled) return;
      window.clearTimeout(timer);
      controller.abort();
      cancelPreload();
      session?.destroy();
      setLoading(false);
      setError(String(reason?.message || reason));
    };
    const timer = window.setTimeout(
      () =>
        fail("The native player did not start in time. Try another source."),
      Number(stream.playbackTimeoutMs) || 120000,
    );

    const start = async () => {
      unlisten = await listenNativePlayer(({ payload }) => {
        if (cancelled || payload?.sessionId !== sessionId) return;
        if (payload.kind === "preload-status") {
          const current = preload;
          if (current && current.id === payload.preloadId && !current.claimed) {
            current.prepared = true;
            if (!current.ready)
              void reportPreload(current, "buffering", payload.percent);
          }
        } else if (payload.kind === "opened") {
          setNativeSessionId(sessionId);
        } else if (payload.kind === "playing") {
          window.clearTimeout(timer);
          setLoading(false);
          setNativePlaying(true);
          if (!played) {
            played = true;
            callbacks.current.onStarted?.();
          }
        } else if (
          payload.kind === "progress" &&
          played &&
          Number.isFinite(payload.position) &&
          Number.isFinite(payload.duration)
        ) {
          lastSample = {
            position: payload.position,
            duration: payload.duration,
            completed: false,
          };
          callbacks.current.onProgress?.(lastSample, false);
        } else if (payload.kind === "complete") {
          if (!played || ended) return;
          ended = true;
          if (
            Number.isFinite(payload.position) &&
            Number.isFinite(payload.duration)
          )
            lastSample = {
              position: payload.position,
              duration: payload.duration,
              completed: true,
            };
          if (lastSample) {
            lastSample = { ...lastSample, completed: true };
            callbacks.current.onProgress?.(lastSample, true);
          }
          if (!readAppSettings().autoNext) {
            callbacks.current.onClose?.();
            return;
          }
          const next = [...(callbacks.current.episodes || [])]
            .filter(
              (item) =>
                (item.season > season ||
                  (item.season === season && item.episode > episode)) &&
                (!(item.releaseDate || item.date) ||
                  new Date(item.releaseDate || item.date).getTime() <=
                    Date.now()),
            )
            .sort((a, b) => a.season - b.season || a.episode - b.episode)[0];
          advanceEpisode(
            payload.nextVideoId ||
              preload?.videoId ||
              (next && String(next.id)),
            true,
          );
        } else if (payload.kind === "closed") {
          if (lastSample) callbacks.current.onProgress?.(lastSample, true);
          if (!ended) callbacks.current.onClose?.();
        } else if (payload.kind === "close") {
          if (lastSample) callbacks.current.onProgress?.(lastSample, true);
          callbacks.current.onClose?.();
        } else if (payload.kind === "episode") {
          if (lastSample) callbacks.current.onProgress?.(lastSample, true);
          if (payload.mode === "cancel-preload") {
            cancelPreload();
          } else if (payload.mode === "preload") {
            if (preload || !played) return;
            const current = {
              id: crypto.randomUUID(),
              videoId: payload.videoId,
              controller: new AbortController(),
              ready: false,
              claimed: false,
            };
            preload = current;
            import("@tauri-apps/api/core")
              .then(async ({ invoke }) => {
                await reportPreload(current, "lookup");
                if (!stream.isNativeTorrent) {
                  await reportPreload(current, "unsupported");
                  return;
                }
                const choice = await callbacks.current.onResolvePreload?.(
                  current.videoId,
                  current.controller.signal,
                );
                if (
                  current.controller.signal.aborted ||
                  cancelled ||
                  preload !== current
                )
                  return;
                if (!choice?.stream?.torrent) {
                  await reportPreload(current, "unavailable");
                  return;
                }
                current.choice = choice;
                await reportPreload(current, "metadata");
                await invoke("preload_native_torrent", {
                  sessionId,
                  preloadId: current.id,
                  infoHash: choice.stream.torrent.infoHash,
                  fileIdx: choice.stream.torrent.fileIdx,
                  sources: choice.stream.torrent.sources || [],
                });
                if (current.claimed || current.claiming) return;
                if (
                  current.controller.signal.aborted ||
                  cancelled ||
                  preload !== current
                ) {
                  await invoke("control_native_preload", {
                    sessionId,
                    preloadId: current.id,
                    claim: false,
                  });
                  return;
                }
                current.ready = true;
                await reportPreload(current, "ready", 100);
              })
              .catch(() => {
                if (
                  preload === current &&
                  !current.claimed &&
                  !current.claiming
                ) {
                  current.controller.abort();
                  void reportPreload(current, "failed");
                }
              });
          } else if (payload.mode === "season") {
            seasonController?.abort();
            seasonController = new AbortController();
            const signal = seasonController.signal;
            const requestedSeason = Number(payload.videoId);
            if (!Number.isInteger(requestedSeason) || requestedSeason < 0)
              return;
            drawerSeason.current = requestedSeason;
            import("@tauri-apps/api/core")
              .then(async () => {
                const update = (items, status) =>
                  invokeNativePlayer("update_native_player_episodes", {
                    sessionId,
                    season: requestedSeason,
                    status,
                    revision: ++episodeRevision.current,
                    episodes: items.map((item) => ({
                      id: String(item.id),
                      season: item.season ?? null,
                      episode: item.episode ?? null,
                      title: item.title || "Episode",
                      date: item.date || item.releaseDate || null,
                      image: null,
                      imageUrl: item.image || null,
                    })),
                  });
                const initial = update(
                  callbacks.current.episodes || [],
                  "loading",
                ).catch(() => {});
                try {
                  const loaded =
                    (await callbacks.current.onLoadSeason?.(
                      requestedSeason,
                      signal,
                    )) || [];
                  if (cancelled || signal.aborted) return;
                  const merged = [
                    ...(callbacks.current.episodes || []).filter(
                      (item) => item.season !== requestedSeason,
                    ),
                    ...loaded,
                  ];
                  await update(merged, "ready");
                } catch {
                  await initial.catch(() => {});
                  if (!cancelled && !signal.aborted)
                    await update(
                      callbacks.current.episodes || [],
                      "error",
                    ).catch(() => {});
                }
              })
              .catch(() => {});
          } else if (payload.mode === "choose") {
            cancelPreload();
            choiceController?.abort();
            choiceController = new AbortController();
            const signal = choiceController.signal;
            choices = [];
            import("@tauri-apps/api/core")
              .then(async () => {
                try {
                  const resolved =
                    await callbacks.current.onResolveEpisodeStreams?.(
                      payload.videoId,
                      signal,
                      payload.providerId || undefined,
                    );
                  if (signal.aborted || cancelled) return;
                  choices = resolved || [];
                  await invokeNativePlayer("update_native_player_streams", {
                    sessionId,
                    videoId: payload.videoId,
                    requestId: payload.choiceId,
                    streams: choices.map((item, index) => ({
                      id: String(index),
                      label: item.label,
                      ...streamPresentation(item.label, item.stream),
                      providerId: item.providerId,
                      providerLabel: item.providerLabel,
                      providerLogo: item.providerLogo,
                    })),
                  });
                } catch {
                  if (!signal.aborted && !cancelled)
                    await invokeNativePlayer("update_native_player_streams", {
                      sessionId,
                      videoId: payload.videoId,
                      requestId: payload.choiceId,
                      streams: [],
                    }).catch(() => {});
                }
              })
              .catch(() => {});
          } else if (payload.mode === "source") {
            const choice = choices[Number(payload.choiceId)];
            if (choice)
              callbacks.current.onEpisodeSelect?.(
                payload.videoId,
                false,
                choice,
              );
          } else advanceEpisode(payload.videoId);
        } else if (payload.kind === "subtitle") {
          const item = callbacks.current.subtitles?.find(
            (item) => subtitleKey(item) === payload.subtitleId,
          );
          if (!item || !played) return;
          import("@tauri-apps/api/core")
            .then(() =>
              invokeNativePlayer("load_native_subtitle", {
                sessionId,
                id: payload.subtitleId,
                url: item.url,
                label: item.label,
                lang: item.lang || item.language || "und",
              }),
            )
            .catch(() => {});
        } else if (payload.kind === "preferences") {
          callbacks.current.onPreferences?.(payload.tracks);
        } else if (payload.kind === "settings") {
          savePlayerSkipSettings(payload.settings);
        } else if (payload.kind === "error") {
          fail(
            "The native player could not open this video. Try another source.",
          );
        }
      });
      if (cancelled) return;
      session = await startNativeTorrent({
        stream,
        sessionId,
        resumePosition,
        signal: controller.signal,
        onStatus: setLoadingMessage,
        ui: {
          logo: null,
          logoUrl: initialUi.current.logo || null,
          fallbackLogoUrl: new URL(rainflixLogo, window.location.href).href,
          backdropUrl: initialUi.current.poster || null,
          tracks: nativeTrackSettings(
            initialUi.current.preferences?.tracks || {},
          ),
          seasons: initialUi.current.seasons || [],
          providers: initialUi.current.streamProviders || [],
          title: Number.isInteger(episode)
            ? `${initialUi.current.title} - S${season} E${episode}${initialUi.current.episodeTitle ? `: ${initialUi.current.episodeTitle}` : ""}`
            : initialUi.current.episodeTitle
              ? `${initialUi.current.title} - ${initialUi.current.episodeTitle}`
              : initialUi.current.title,
          currentVideoId:
            currentVideoId == null ? null : String(currentVideoId),
          season: Number.isInteger(season) && season >= 0 ? season : null,
          episodes: (initialEpisodes.current || [])
            .filter((item) => item.id != null)
            .map((item) => ({
              id: String(item.id),
              season:
                Number.isInteger(item.season) && item.season >= 0
                  ? item.season
                  : null,
              episode:
                Number.isInteger(item.episode) && item.episode >= 0
                  ? item.episode
                  : null,
              title: String(item.title || "Episode"),
              date: item.date ? String(item.date) : null,
              imageUrl: item.image || null,
            })),
        },
      });
      if (cancelled) {
        session.destroy();
        return;
      }
      if (!cancelled) setNativeSessionId(session.sessionId);
    };
    start().catch((reason) => {
      if (!cancelled) fail(reason);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (lastSample) callbacks.current.onProgress?.(lastSample, true);
      controller.abort();
      cancelPreload();
      choiceController?.abort();
      seasonController?.abort();
      session?.destroy();
      unlisten?.();
    };
  }, [stream, resumePosition, currentVideoId, season, episode]);

  return (
    <div className="relative h-full w-full bg-black">
      <span className="sr-only" role="status">
        {loading ? loadingMessage : ""}
      </span>
      {error && (
        <button
          className="absolute left-6 top-6 z-50 rounded-lg bg-black/75 px-4 py-3 text-white"
          onClick={onClose}
          aria-label="Cancel native playback"
        >
          Back
        </button>
      )}
      {error ? <PlayerMessage message={error} onRetry={onRetry} /> : null}
    </div>
  );
}

export default function AddonPlayer({
  stream,
  provider,
  settings,
  details,
  season,
  episode,
  episodes,
  streamProviders,
  seasons,
  preferences,
  onPreferences,
  currentVideoId,
  onEpisodeSelect,
  onResolveEpisodeStreams,
  onResolvePreload,
  onLoadSeason,
  episodeTitle,
  onStarted,
  onProgress,
  onEnded,
  onClose,
  resumePosition,
  onRetry,
}) {
  const [subtitles, setSubtitles] = useState([]);
  const installed = useAddons();
  const [subtitleError, setSubtitleError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSubtitles([]);
    setSubtitleError(false);
    Promise.allSettled([
      installedSubtitles(
        installed,
        details,
        season,
        episode,
        stream,
        controller.signal,
      ),
      provider.addonId
        ? Promise.resolve([])
        : provider.getSubtitles?.(details, season, episode, controller.signal),
    ]).then(([addons, own]) => {
      if (controller.signal.aborted) return;
      setSubtitles([
        ...(addons.status === "fulfilled" ? addons.value.subtitles : []),
        ...(own.status === "fulfilled" ? own.value || [] : []),
      ]);
      setSubtitleError(
        addons.status === "rejected" ||
          addons.value.failed ||
          own.status === "rejected",
      );
    });
    return () => controller.abort();
  }, [provider, details, season, episode, stream, installed]);
  const allSubtitles = useMemo(() => {
    const seen = new Set();
    return [...(stream.subtitles || []), ...subtitles].filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [stream, subtitles]);
  return (
    <section
      id="playerShell"
      className="relative h-full min-h-0 w-full bg-black"
      aria-label={`${provider.label} player`}
    >
      {stream.isNativeTorrent || stream.isNativeMedia ? (
        <NativeTorrentPlayer
          stream={stream}
          title={details.title}
          logo={details.logo}
          resumePosition={resumePosition}
          onStarted={onStarted}
          onProgress={onProgress}
          onEnded={onEnded}
          onClose={onClose}
          onRetry={onRetry}
          season={season}
          episode={
            details.mediaType === "tv" || details.addonType === "series"
              ? episode
              : undefined
          }
          episodes={episodes}
          streamProviders={streamProviders}
          seasons={seasons}
          preferences={preferences}
          onPreferences={onPreferences}
          subtitles={allSubtitles}
          subtitleLookupError={subtitleError}
          poster={details.backdrop || details.poster}
          currentVideoId={currentVideoId}
          onEpisodeSelect={onEpisodeSelect}
          onResolveEpisodeStreams={onResolveEpisodeStreams}
          onResolvePreload={onResolvePreload}
          onLoadSeason={onLoadSeason}
          episodeTitle={episodeTitle}
        />
      ) : (
        <StreamVideo
          stream={stream}
          title={details.title}
          poster={details.backdrop || details.poster}
          logo={details.logo}
          subtitles={allSubtitles}
          subtitleLookupError={subtitleError}
          onStarted={onStarted}
          onProgress={onProgress}
          onEnded={onEnded}
          resumePosition={resumePosition}
          onRetry={onRetry}
          provider={provider}
          settings={settings}
          preferences={preferences}
          onPreferences={onPreferences}
          autoStart
          fullscreen
        />
      )}
    </section>
  );
}
