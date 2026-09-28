import { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  Check,
  ExternalLink,
  LoaderCircle,
  Play,
  RefreshCw,
} from "lucide-react";
import { parse } from "@plussub/srt-vtt-parser";
import { addonFetch } from "../lib/addon-streams.js";
import { startBrowserTorrent } from "../lib/browser-torrent.js";

function StreamVideo({
  stream,
  title,
  poster,
  subtitles,
  subtitleLookupError,
  onStarted,
  onRetry,
  provider,
  settings,
  autoStart = false,
  fullscreen = false,
}) {
  const videoRef = useRef(null);
  const captionRef = useRef(null);
  const [loading, setLoading] = useState(!stream.blockedReason);
  const [loadingMessage, setLoadingMessage] = useState("Loading stream");
  const [error, setError] = useState(stream.blockedReason);
  const [subtitleUrl, setSubtitleUrl] = useState("");
  const [subtitleError, setSubtitleError] = useState("");
  const [captionsOpen, setCaptionsOpen] = useState(false);
  const captionsButton = useRef(null);
  const [started, setStarted] = useState(autoStart || !stream.requiresStart);
  const frameClass = fullscreen
    ? "relative h-full min-h-0 w-full overflow-hidden bg-black"
    : "relative aspect-video w-full overflow-hidden bg-black";

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
      setLoading(false);
    };
    const waiting = () => {
      if (cancelled || failed) return;
      window.clearTimeout(timer);
      setLoading(true);
      setLoadingMessage("Buffering stream");
      timer = window.setTimeout(
        fail,
        Number(stream.playbackTimeoutMs || settings.playbackTimeoutMs) || 25000,
      );
    };
    video.addEventListener("loadeddata", ready);
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
      cancelled = true;
      torrentController.abort();
      window.clearTimeout(timer);
      video.removeEventListener("loadeddata", ready);
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
  }, [stream, started, settings.playbackTimeoutMs]);

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
        <PlayerMessage
          message={stream.blockedReason}
          externalUrl={stream.externalUrl}
        />
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
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          controls
          autoPlay={autoStart || stream.requiresStart}
          playsInline
          preload="auto"
          poster={poster}
          tabIndex={0}
          aria-label={`${title} ${provider.label} player`}
          onPlaying={onStarted}
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
        {loading && !error ? (
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/55 p-4 text-center"
            role="status"
          >
            <LoaderCircle
              className="h-7 w-7 animate-spin text-sky-300"
              aria-hidden="true"
            />
            <span className="max-w-md text-sm font-bold text-slate-100">
              {loadingMessage}
            </span>
          </div>
        ) : null}
        {error ? (
          <PlayerMessage
            message={error}
            onRetry={onRetry}
            externalUrl={stream.externalUrl}
          />
        ) : null}
        {(subtitles.length > 0 || subtitleLookupError) && (
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
                {[{ url: "", label: "Off" }, ...subtitles].map((subtitle) => (
                  <button
                    type="button"
                    key={subtitle.url}
                    aria-pressed={subtitleUrl === subtitle.url}
                    className="flex min-h-11 w-full items-center gap-2 rounded px-3 text-left text-sm hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-sky-400"
                    onClick={() => {
                      setSubtitleUrl(subtitle.url);
                      setCaptionsOpen(false);
                      captionsButton.current?.focus();
                    }}
                  >
                    <span className="flex-1 break-words">{subtitle.label}</span>
                    {subtitleUrl === subtitle.url && (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                ))}
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

function PlayerMessage({ message, onRetry, loading = false, externalUrl }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-slate-950/95 p-4 text-center"
      role="status"
    >
      {loading ? (
        <LoaderCircle
          className="h-7 w-7 shrink-0 animate-spin text-sky-300"
          aria-hidden="true"
        />
      ) : null}
      <p className="max-w-md text-sm text-slate-300">{message}</p>
      {externalUrl ? (
        <a
          href={externalUrl}
          rel="noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-sky-500/60 px-4 text-sm font-bold text-sky-200 hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />{" "}
          {externalUrl.startsWith("magnet:") ? "Open torrent" : "Open stream"}
        </a>
      ) : null}
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

export default function AddonPlayer({
  stream,
  provider,
  settings,
  details,
  season,
  episode,
  onStarted,
  onRetry,
}) {
  const [subtitles, setSubtitles] = useState([]);
  const [subtitleError, setSubtitleError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setSubtitles([]);
    setSubtitleError(false);
    provider
      .getSubtitles?.(details, season, episode, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setSubtitles(items);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSubtitleError(true);
      });
    return () => controller.abort();
  }, [provider, details, season, episode]);
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
      <StreamVideo
        stream={stream}
        title={details.title}
        poster={details.backdrop || details.poster}
        subtitles={allSubtitles}
        subtitleLookupError={subtitleError}
        onStarted={onStarted}
        onRetry={onRetry}
        provider={provider}
        settings={settings}
        autoStart
        fullscreen
      />
    </section>
  );
}
