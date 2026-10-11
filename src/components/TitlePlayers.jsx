import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { ArrowLeft, Maximize, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";
import { config, trackEvent } from "../lib/api.js";
import { httpUrl } from "../lib/addon-streams.js";
import { supports, useAddons, useAddonRestoring } from "../lib/addons.js";
import {
  framePlaybackEvent,
  playbackIdentity,
  readPlaybackPosition,
  resumedFrameUrl,
  savePlaybackProgress,
  playbackFinished,
} from "../lib/playback-progress.js";
import AddonPlayer from "./AddonPlayer.jsx";
import AddonSources, { streamProvider } from "./AddonSources.jsx";
import {
  readPlaybackPreferences,
  savePlaybackPreferences,
  streamPreference,
  preferredEpisodeStream,
} from "../lib/playback-preferences.js";
import PlaybackLoader from "./PlaybackLoader.jsx";
import OfficialProviders from "./OfficialProviders.jsx";
import { withNativeMedia, withNativeTorrent } from "../lib/native-torrent.js";
import { isAndroid, isNativeApp } from "../platform/index.js";
import rainflixLogo from "../../assets/rainflix-r.png";
import AddonLogo from "./AddonLogo.jsx";
import { cachedAddonLogo } from "../lib/addon-logos.js";
import {
  readPlaybackHandoff,
  takePlaybackHandoff,
} from "../lib/playback-handoff.js";

const ignorePlayback = () => {};

function StreamProviderLogo({ url }) {
  return <AddonLogo url={url} />;
}

function requestFullscreen() {
  try {
    // Keep the fullscreen surface alive when an episode's portal is replaced.
    const element = document.documentElement;
    const request =
      element?.requestFullscreen || element?.webkitRequestFullscreen;
    Promise.resolve(request?.call(element)).catch(() => {});
  } catch {
    // The fixed viewport player remains usable when native fullscreen is unavailable.
  }
}

function FramePlayer({
  source,
  details,
  season,
  episode,
  onStarted,
  onProgress,
}) {
  const frame = useRef(null);
  const callbacks = useRef({ onStarted, onProgress });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    callbacks.current = { onStarted, onProgress };
  }, [onStarted, onProgress]);
  useEffect(() => {
    const origin = new URL(source.url).origin;
    let played = false;
    let lastSample;
    const flushPosition = () => {
      if (lastSample) callbacks.current.onProgress?.(lastSample, true);
    };
    const visibilityChange = () => {
      if (document.visibilityState === "hidden") flushPosition();
    };
    const receive = (event) => {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      const playback = framePlaybackEvent(event.data, details, season, episode);
      if (!playback) return;
      if (["play", "playing"].includes(playback.name)) {
        played = true;
        callbacks.current.onStarted?.();
      }
      if (played && playback.sample) {
        lastSample = playback.sample;
        callbacks.current.onProgress?.(
          lastSample,
          ["pause", "seeked", "ended"].includes(playback.name),
        );
      }
    };
    let timer;
    const blur = () => {
      timer = window.setTimeout(() => {
        if (document.activeElement === frame.current)
          callbacks.current.onStarted?.();
      }, 0);
    };
    window.addEventListener("message", receive);
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", flushPosition);
    document.addEventListener("visibilitychange", visibilityChange);
    return () => {
      flushPosition();
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", flushPosition);
      document.removeEventListener("visibilitychange", visibilityChange);
    };
  }, [source.url, details, season, episode]);
  return (
    <div id="playerShell" className="relative h-full min-h-0 w-full bg-black">
      <iframe
        ref={frame}
        className="absolute inset-0 h-full w-full border-0"
        src={source.url}
        title={`${details.title} ${source.label} player`}
        allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *"
        allowFullScreen
        referrerPolicy="origin"
        onLoad={() => setLoading(false)}
        onPointerDown={onStarted}
      />
      <PlaybackLoader
        active={loading}
        title={details.title}
        logo={details.logo}
        message="Loading player"
      />
    </div>
  );
}

function Playback({
  source,
  details,
  season,
  episode,
  onStarted,
  onProgress,
  onClose,
  children,
  nativePlayback = false,
  transition,
}) {
  const root = useRef(null);
  const closeCallback = useRef(onClose);
  useEffect(() => {
    closeCallback.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const close = () => closeCallback.current();
    window.addEventListener("rainflix:close-playback", close);
    return () => window.removeEventListener("rainflix:close-playback", close);
  }, []);
  const closeButton = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef(null);
  useEffect(() => {
    if (!isAndroid || nativePlayback) return;
    let disposed = false;
    let invoke;
    import("@tauri-apps/api/core")
      .then(async (core) => {
        invoke = core.invoke;
        if (disposed) return;
        await invoke("plugin:native-player|set_orientation", {
          landscape: true,
        });
        if (disposed)
          await invoke("plugin:native-player|set_orientation", {
            landscape: false,
          });
      })
      .catch(() => {});
    return () => {
      disposed = true;
      invoke?.("plugin:native-player|set_orientation", {
        landscape: false,
      }).catch(() => {});
    };
  }, [nativePlayback]);
  const revealControls = () => {
    setControlsVisible(true);
    window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(
      () => setControlsVisible(false),
      2400,
    );
  };
  useEffect(() => {
    controlsTimer.current = window.setTimeout(
      () => setControlsVisible(false),
      2400,
    );
    return () => window.clearTimeout(controlsTimer.current);
  }, []);
  useEffect(() => {
    const container = root.current;
    const shell = document.getElementById("app-shell");
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    const wasInert = shell?.inert;
    (closeButton.current || container)?.focus({ preventScroll: true });
    if (shell) {
      shell.inert = true;
      shell.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    let enteredFullscreen = [container, document.documentElement].includes(
      document.fullscreenElement || document.webkitFullscreenElement,
    );
    const fullscreenChange = () => {
      const element =
        document.fullscreenElement || document.webkitFullscreenElement;
      // The previous episode can still be exiting fullscreen as this one mounts.
      // Its events must not become this player's close signal.
      if (element === container || element === document.documentElement)
        enteredFullscreen = true;
      else if (!element && enteredFullscreen) closeCallback.current();
    };
    document.addEventListener("fullscreenchange", fullscreenChange);
    document.addEventListener("webkitfullscreenchange", fullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", fullscreenChange);
      document.removeEventListener("webkitfullscreenchange", fullscreenChange);
      if (shell) {
        shell.inert = wasInert;
        shell.removeAttribute("aria-hidden");
      }
      document.body.style.overflow = overflow;
      const element =
        document.fullscreenElement || document.webkitFullscreenElement;
      if (
        // eslint-disable-next-line react-hooks/exhaustive-deps -- Read handoff intent at teardown, not mount.
        !transition?.current &&
        (element === document.documentElement ||
          element === container ||
          element?.closest?.("#fullscreenPlayback"))
      ) {
        try {
          Promise.resolve(
            document.exitFullscreen?.() || document.webkitExitFullscreen?.(),
          ).catch(() => {});
        } catch {
          /* Already exiting. */
        }
      }
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [transition]);

  return createPortal(
    <div
      id="fullscreenPlayback"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${details.title} playback`}
      tabIndex={-1}
      className="fullscreen-playback fixed inset-0 z-[1000] h-[100dvh] min-h-0 w-full bg-black text-slate-100"
      data-controls-visible={controlsVisible}
      onPointerMove={revealControls}
      onPointerDown={revealControls}
      onKeyDown={(event) => {
        revealControls();
        if (event.key !== "Tab") return;
        const nodes = [
          ...root.current.querySelectorAll(
            "button:not(:disabled), select, video, iframe, a[href]",
          ),
        ].filter((node) => node.getClientRects().length);
        if (event.shiftKey && document.activeElement === nodes[0]) {
          event.preventDefault();
          nodes.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) {
          event.preventDefault();
          nodes[0]?.focus();
        }
      }}
    >
      {children || (
        <FramePlayer
          source={source}
          details={details}
          season={season}
          episode={episode}
          onStarted={onStarted}
          onProgress={onProgress}
        />
      )}
      {!nativePlayback && isNativeApp && (
        <div className="pointer-events-none absolute right-3 top-3 z-40 flex gap-2">
          {source.id !== "trailer" && (
            <button
              className="player-overlay-control pointer-events-auto grid h-11 w-11 place-items-center rounded-lg bg-black/75 text-white focus-visible:ring-2 focus-visible:ring-sky-400"
              aria-label="Enter fullscreen"
              title="Enter fullscreen"
              onClick={requestFullscreen}
            >
              <Maximize className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <button
            ref={closeButton}
            data-playback-close
            className="player-overlay-control pointer-events-auto grid h-11 w-11 place-items-center rounded-lg bg-black/75 text-white focus-visible:ring-2 focus-visible:ring-sky-400"
            aria-label="Close player"
            title="Close player"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>,
    document.body,
  );
}

export default function TitlePlayers({
  ref,
  details,
  season,
  episode,
  episodes,
  seasons,
  currentVideoId,
  onEpisodeSelect,
  onLoadSeason,
  onEpisodeEnded,
  canPlay,
  onStarted,
  onCompleted,
  trailerKey,
  episodePicker,
  episodeLabel,
  episodeTitle,
  episodeChosen = true,
  onBackToEpisodes,
  seriesProvider = "",
  onSeriesProviderChange,
  onSelectionStepChange,
}) {
  const installed = useAddons();
  const restoring = useAddonRestoring();
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState(null);
  const [providerChoice, setProviderChoice] = useState("");
  const [providerRevision, setProviderRevision] = useState(0);
  const [sourcesVisible, setSourcesVisible] = useState(false);
  const [availability, setAvailability] = useState({});
  const [availabilityRevision, setAvailabilityRevision] = useState(0);
  const [resumePreference, setResumePreference] = useState(() =>
    new URLSearchParams(location.search).get("resume") === "1"
      ? readPlaybackPreferences(details)
      : null,
  );
  const resumed = useRef(false);
  const episodePlayback = useRef(location.state?.rainflixEpisodePlayback);
  const started = useRef(false);
  const completedIdentity = useRef(null);
  const endController = useRef(null);
  const transition = useRef(false);
  useEffect(() => () => endController.current?.abort(), []);
  const pendingPreference = useRef(null);
  const remembered = useRef(readPlaybackPreferences(details));
  const sourceBack = useRef(null);
  const selectionPanel = useRef(null);
  const sourcePanel = useRef(null);
  const providerButtons = useRef(new Map());
  const progressIdentity = useMemo(
    () => playbackIdentity(details, season, episode),
    [details, season, episode],
  );
  const recordProgress = useCallback(
    (sample, flush) => {
      if (!progressIdentity) return;
      const complete =
        playbackFinished(sample, details.addonType || details.mediaType) ||
        completedIdentity.current === progressIdentity?.key;
      const firstCompletion =
        complete && completedIdentity.current !== progressIdentity?.key;
      if (firstCompletion) {
        completedIdentity.current = progressIdentity?.key;
        onCompleted?.();
      }
      savePlaybackProgress(
        progressIdentity,
        { ...sample, completed: complete },
        flush || firstCompletion,
      );
    },
    [progressIdentity, onCompleted, details.addonType, details.mediaType],
  );
  const sources = useMemo(() => {
    const tmdb = details.tmdbDetails;
    return [
      ...(tmdb?.imdbId && config.yastream?.enabled
        ? [{ id: "yastream", label: "Yastream" }]
        : []),
      ...(tmdb?.imdbId && config.torrentio?.enabled
        ? [{ id: "torrentio", label: "Torrentio" }]
        : []),
      ...installed
        .filter(
          (addon) =>
            details.addonVideoId &&
            ((Array.isArray(details.addonStreams) &&
              addon.id === details.addonStreamOwner) ||
              supports(
                addon,
                "stream",
                details.addonType,
                details.addonVideoId,
              )),
        )
        .map((addon) => ({ id: addon.id, label: addon.manifest.name, addon })),
    ];
  }, [details, installed]);
  const providerFirst =
    Boolean(episodePicker) && details.addonType === "series";
  useEffect(() => {
    const controller = new AbortController();
    setAvailability({});
    if (providerFirst && !episodeChosen) return () => controller.abort();
    for (const source of sources) {
      const metadata =
        !source.addon && details.tmdbDetails ? details.tmdbDetails : details;
      streamProvider(source)
        .getStreams(metadata, season, episode, controller.signal)
        .then((streams) => {
          if (!controller.signal.aborted)
            setAvailability((current) => ({
              ...current,
              [source.id]: { streams },
            }));
        })
        .catch((error) => {
          if (!controller.signal.aborted)
            setAvailability((current) => ({
              ...current,
              [source.id]: { streams: [], error: error.message },
            }));
        });
    }
    return () => controller.abort();
  }, [
    sources,
    details,
    season,
    episode,
    availabilityRevision,
    providerFirst,
    episodeChosen,
  ]);
  const availableSources = sources.filter(
    (source) => availability[source.id]?.streams.length,
  );
  const checkingSources =
    restoring ||
    (!(providerFirst && !episodeChosen) &&
      sources.some((source) => !availability[source.id]));
  const listedSources =
    providerFirst && !episodeChosen ? sources : availableSources;
  useEffect(() => {
    if (resumed.current || !resumePreference?.providerId) return;
    const source = availableSources.find(
      (item) => item.id === resumePreference.providerId,
    );
    if (!source) return;
    resumed.current = true;
    setProviderChoice(source.id);
    setSourcesVisible(false);
  }, [availableSources, resumePreference]);
  const chosenProvider = sources.find(
    (source) =>
      source.id === (providerChoice || (episodeChosen ? seriesProvider : "")) &&
      !source.url,
  );
  const chosenProviderId = chosenProvider?.id;
  const showSources = Boolean(chosenProvider && sourcesVisible);
  const hasEpisodePicker = Boolean(episodePicker);
  const pickingEpisode =
    !episodeChosen && (!providerFirst || Boolean(seriesProvider));
  const revealSources = useCallback(() => setSourcesVisible(true), []);
  const trailer = useMemo(
    () =>
      trailerKey
        ? {
            id: "trailer",
            label: "Trailer",
            url: `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=1&playsinline=1&rel=0&fs=0`,
          }
        : null,
    [trailerKey],
  );
  const active =
    selection &&
    (selection.id === "trailer"
      ? trailer
      : sources.find((source) => source.id === selection.id));
  const lookupPending = Boolean(
    episodeChosen && chosenProvider && !sourcesVisible && !active,
  );
  const close = useCallback(() => {
    transition.current = false;
    endController.current?.abort();
    setSelection(null);
    if (providerFirst) {
      setProviderChoice("");
      setSourcesVisible(false);
      onSeriesProviderChange?.("");
      onBackToEpisodes?.();
    }
    navigate(-1);
  }, [navigate, providerFirst, onSeriesProviderChange, onBackToEpisodes]);
  const finishPlayback = async () => {
    if (endController.current) return;
    const controller = new AbortController();
    endController.current = controller;
    transition.current = true;
    try {
      const continued = await onEpisodeEnded?.(controller.signal);
      if (!controller.signal.aborted && !continued) close();
    } catch {
      if (!controller.signal.aborted) close();
    } finally {
      if (endController.current === controller) endController.current = null;
    }
  };
  const markStarted = useCallback(() => {
    if (!started.current) {
      started.current = true;
      completedIdentity.current = null;
      if (pendingPreference.current) {
        savePlaybackPreferences(details, pendingPreference.current);
        remembered.current = readPlaybackPreferences(details);
      }
      onStarted?.();
    }
  }, [onStarted, details]);
  const start = (source, playback) => {
    const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const params = new URLSearchParams(location.search);
    params.set("play", "1");
    params.delete("resume");
    pendingPreference.current = playback
      ? {
          providerId: source.id,
          quality: streamPreference(playback.stream),
        }
      : null;
    remembered.current = readPlaybackPreferences(details);
    const resumePosition =
      source.id === "trailer" ? 0 : readPlaybackPosition(progressIdentity);
    started.current = false;
    // Mount and request fullscreen during the provider click's user activation.
    flushSync(() => {
      setSelection({
        id: source.id,
        token,
        playback,
        resumePosition,
        frameUrl: source.url ? resumedFrameUrl(source, resumePosition) : null,
      });
      if (resumePreference) {
        const titleParams = new URLSearchParams(params);
        titleParams.delete("play");
        navigate(
          {
            pathname: location.pathname,
            search: titleParams.size ? `?${titleParams}` : "",
          },
          { replace: true },
        );
      }
      navigate(
        { pathname: location.pathname, search: `?${params}` },
        {
          state: { rainflixPlayback: token },
        },
      );
    });
    if (
      !playback?.stream?.isNativeTorrent &&
      !playback?.stream?.isNativeMedia
    ) {
      requestFullscreen();
    }
    trackEvent("player-source", { source: source.addon ? "addon" : source.id });
  };
  useEffect(() => {
    const pending = readPlaybackHandoff(episodePlayback.current);
    if (!pending) return;
    const source = sources.find((item) => item.id === pending.providerId);
    if (!source) return;
    const timer = window.setTimeout(() => {
      takePlaybackHandoff(episodePlayback.current);
      episodePlayback.current = null;
      start(source, {
        stream: pending.stream,
        provider: streamProvider(source),
        settings: config[source.id] || {},
        details,
      });
    }, 0);
    return () => window.clearTimeout(timer);
    // A sidebar choice is a one-shot, in-memory handoff, not a saved stream URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);
  const resolveEpisodeStreams = async (videoId, signal, providerId) => {
    let video = episodes?.find((item) => String(item.id) === videoId);
    if (!video) {
      const match = /^tt\d+:(\d+):\d+$/.exec(videoId);
      if (match && onLoadSeason) {
        const loaded = await onLoadSeason(Number(match[1]), signal);
        video = loaded?.find((item) => String(item.id) === videoId);
      }
    }
    if (!video) return [];
    const release = video.releaseDate || video.date;
    if (release && new Date(release).getTime() > Date.now()) return [];
    const target = {
      ...details,
      addonVideoId: videoId,
      addonStreams: video.streams,
      sourceEpisodeNumber: video.sourceEpisodeNumber,
      sourceSeasonNumber: video.sourceSeasonNumber,
    };
    const results = await Promise.all(
      sources
        .filter((source) => !providerId || source.id === providerId)
        .map(async (source) => {
          try {
            const metadata = source.addon
              ? target
              : target.tmdbDetails || target;
            const streams = await streamProvider(source).getStreams(
              metadata,
              video.season ?? 1,
              video.episode ?? 1,
              signal,
            );
            const providerLogo = await cachedAddonLogo(
              source.addon?.manifest.logo || source.logo,
            );
            if (signal?.aborted) return [];
            return streams
              .map(withNativeTorrent)
              .map(withNativeMedia)
              .filter((stream) => !stream.blockedReason)
              .map((stream) => ({
                providerId: source.id,
                providerLabel: source.label,
                providerLogo,
                label: stream.label,
                stream,
              }));
          } catch {
            return [];
          }
        }),
    );
    return results.flat();
  };
  useImperativeHandle(ref, () => ({
    resume() {
      const preference = readPlaybackPreferences(details);
      if (
        !availableSources.some((source) => source.id === preference.providerId)
      )
        return;
      setResumePreference(preference);
      setProviderChoice(preference.providerId);
      setSourcesVisible(false);
      resumed.current = true;
    },
    playTrailer() {
      if (!trailer) return;
      setProviderChoice("");
      setSourcesVisible(false);
      start(trailer);
    },
  }));
  useEffect(() => {
    const selecting = pickingEpisode || showSources || lookupPending;
    onSelectionStepChange?.(selecting);
    if (selecting && window.matchMedia("(max-width: 767px)").matches) {
      selectionPanel.current?.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
    }
  }, [pickingEpisode, showSources, lookupPending, onSelectionStepChange]);
  useEffect(() => {
    if (chosenProviderId && (showSources || lookupPending)) {
      sourceBack.current?.focus({ preventScroll: true });
      if (sourcePanel.current) sourcePanel.current.scrollTop = 0;
    }
  }, [chosenProviderId, showSources, lookupPending]);
  useEffect(() => {
    if (!hasEpisodePicker) return;
    const target = episodeChosen
      ? sourceBack.current
      : sourcePanel.current?.querySelector(
          '[data-video-id][aria-pressed="true"]',
        );
    target?.focus({ preventScroll: true });
  }, [episodeChosen, hasEpisodePicker]);
  const backToPlayers = () => {
    const id = providerChoice;
    flushSync(() => {
      setProviderChoice("");
      setSourcesVisible(false);
      if (providerFirst) {
        onSeriesProviderChange?.(id || seriesProvider);
        onBackToEpisodes?.();
      }
    });
    providerButtons.current.get(id)?.focus({ preventScroll: true });
    if (sourcePanel.current) sourcePanel.current.scrollTop = 0;
  };
  // Stop on pop immediately, even when React coalesces rapid router transitions.
  useEffect(() => {
    const stop = () => {
      endController.current?.abort();
      setSelection(null);
    };
    window.addEventListener("popstate", stop);
    return () => window.removeEventListener("popstate", stop);
  }, []);
  useEffect(() => {
    if (selection && !active) setSelection(null);
  }, [selection, active]);
  return (
    <section
      ref={selectionPanel}
      aria-labelledby="titlePlayersHeading"
      className="flex max-h-[min(42rem,75svh)] min-h-0 scroll-mt-24 flex-col"
    >
      <div className="mb-3 flex min-h-11 shrink-0 items-center gap-3">
        {(lookupPending ||
          showSources ||
          pickingEpisode ||
          (episodePicker && episodeChosen)) && (
          <button
            ref={sourceBack}
            type="button"
            aria-label={
              lookupPending
                ? "Cancel stream lookup"
                : showSources
                  ? providerFirst
                    ? "Back to episodes"
                    : "Back to streams"
                  : pickingEpisode
                    ? "Back to streams"
                    : `Back to ${episodeLabel.toLowerCase()}`
            }
            title={
              lookupPending
                ? "Cancel stream lookup"
                : showSources
                  ? "Back to streams"
                  : `Back to ${episodeLabel.toLowerCase()}`
            }
            onClick={
              showSources || lookupPending
                ? backToPlayers
                : () => {
                    setProviderChoice("");
                    setSourcesVisible(false);
                    if (providerFirst) onSeriesProviderChange?.("");
                    onBackToEpisodes();
                  }
            }
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0">
          <h2
            id="titlePlayersHeading"
            className="min-w-0 break-words text-lg font-bold"
          >
            {pickingEpisode
              ? episodeLabel
              : showSources
                ? chosenProvider.label
                : "Streams"}
          </h2>
          {hasEpisodePicker && episodeChosen && (
            <p className="mt-1 break-words text-xs leading-5 text-slate-400">
              {episodeLabel === "Episodes" ? `S${season} E${episode}: ` : ""}
              {episodeTitle}
            </p>
          )}
        </div>
      </div>
      <div
        ref={sourcePanel}
        data-source-list
        className="min-h-0 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-gutter:stable]"
      >
        {!pickingEpisode && !lookupPending && !showSources && canPlay && (
          <>
            <OfficialProviders details={details} />
            {!isNativeApp && (
              <Link
                to="/downloads"
                aria-label="RainFlix App free streams - download the app"
                className="flex min-h-16 min-w-0 items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <img
                  src={rainflixLogo}
                  alt=""
                  draggable={false}
                  className="h-10 w-10 shrink-0 object-contain"
                />
                <span>
                  <span className="block text-sm font-bold">RainFlix App</span>
                  <span className="block text-xs text-slate-400">
                    Free streams
                  </span>
                </span>
              </Link>
            )}
          </>
        )}
        {pickingEpisode ? (
          episodePicker
        ) : lookupPending ? (
          <div className="min-h-24" aria-busy="true" role="status">
            <span className="sr-only">
              Finding {chosenProvider.label} streams
            </span>
            <div
              className="h-16 animate-pulse rounded-lg bg-white/5"
              aria-hidden="true"
            />
          </div>
        ) : showSources ? null : !canPlay ? (
          <p role="status" className="text-sm text-slate-400">
            No episodes are available for this title.
          </p>
        ) : !listedSources.length && !checkingSources ? (
          <div className="text-sm text-slate-400">
            {!!sources.length && (
              <p role="status">No streams found for this title from addons</p>
            )}
            {!!sources.length && (
              <button
                className="mt-3 min-h-11 text-sky-300"
                onClick={() => setAvailabilityRevision((value) => value + 1)}
              >
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="grid min-w-0 gap-1">
            {checkingSources && (
              <p
                role="status"
                aria-busy="true"
                className="animate-pulse px-3 py-3 text-sm text-slate-400"
              >
                Finding available streams...
              </p>
            )}
            {listedSources.map((source) => (
              <button
                key={source.id}
                ref={(node) => {
                  if (node) providerButtons.current.set(source.id, node);
                  else providerButtons.current.delete(source.id);
                }}
                type="button"
                className="flex min-h-16 w-full min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-bold transition hover:bg-white/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                onClick={() => {
                  if (source.url) {
                    setProviderChoice("");
                    start(source);
                  } else if (providerFirst) {
                    onSeriesProviderChange?.(source.id);
                    onBackToEpisodes?.();
                    setProviderChoice("");
                    setSourcesVisible(false);
                  } else {
                    setProviderChoice(source.id);
                    setSourcesVisible(false);
                    setProviderRevision((value) => value + 1);
                  }
                }}
                aria-label={`Play with ${source.label}`}
              >
                <StreamProviderLogo
                  key={
                    httpUrl(source.addon?.manifest.logo || source.logo) ||
                    "fallback"
                  }
                  url={httpUrl(source.addon?.manifest.logo || source.logo)}
                />
                <span className="min-w-0 break-words">
                  <span className="block">{source.label}</span>
                  {/yastream/i.test(source.label) && (
                    <span className="block text-xs font-normal text-slate-400">
                      Free stream
                    </span>
                  )}
                </span>
              </button>
            ))}
            {!checkingSources && (
              <button
                aria-label="Refresh available streams"
                className="min-h-11 text-left px-3 text-sm text-sky-300"
                onClick={() => setAvailabilityRevision((value) => value + 1)}
              >
                Refresh
              </button>
            )}
          </div>
        )}
        {chosenProvider &&
          episodeChosen &&
          availability[chosenProvider.id] &&
          !episodePlayback.current && (
            <div hidden={!showSources}>
              <AddonSources
                key={chosenProvider.id}
                source={chosenProvider}
                details={
                  !chosenProvider.addon && details.tmdbDetails
                    ? details.tmdbDetails
                    : details
                }
                season={season}
                episode={episode}
                revision={providerRevision}
                initialStreams={availability[chosenProvider.id]?.streams}
                resumePreference={
                  resumed.current &&
                  chosenProvider.id === resumePreference?.providerId
                    ? resumePreference
                    : null
                }
                onReady={revealSources}
                visible={showSources}
                autoPlayAllowed={!active}
                onPlay={(playback, single = false) => {
                  if (single) {
                    setProviderChoice("");
                    setSourcesVisible(false);
                  }
                  start(chosenProvider, playback);
                }}
              />
            </div>
          )}
      </div>
      {active && (
        <Playback
          key={selection.token}
          nativePlayback={Boolean(
            selection.playback?.stream?.isNativeTorrent ||
            selection.playback?.stream?.isNativeMedia,
          )}
          source={{ ...active, url: selection.frameUrl || active.url }}
          details={details}
          season={season}
          episode={episode}
          onStarted={active.id === "trailer" ? ignorePlayback : markStarted}
          onProgress={active.id === "trailer" ? ignorePlayback : recordProgress}
          onClose={close}
          transition={transition}
        >
          {selection.playback && (
            <AddonPlayer
              {...selection.playback}
              season={season}
              episode={episode}
              episodes={episodes}
              streamProviders={sources.map((source) => ({
                id: source.id,
                label: source.label,
                logo: source.addon?.manifest.logo || source.logo || "",
              }))}
              seasons={seasons}
              currentVideoId={currentVideoId}
              onEpisodeSelect={(id, autoplay, playback) => {
                if (id === String(currentVideoId) && playback) {
                  const source = sources.find(
                    (item) => item.id === playback.providerId,
                  );
                  if (source)
                    start(source, {
                      stream: playback.stream,
                      provider: streamProvider(source),
                      settings: config[source.id] || {},
                      details,
                    });
                  return Boolean(source);
                } else {
                  transition.current = Boolean(autoplay || playback);
                  const accepted = onEpisodeSelect?.(id, autoplay, playback);
                  if (accepted === false) transition.current = false;
                  return accepted;
                }
              }}
              onResolveEpisodeStreams={resolveEpisodeStreams}
              onResolvePreload={async (id, signal) => {
                const choices = await resolveEpisodeStreams(
                  id,
                  signal,
                  active.id,
                );
                const stream = preferredEpisodeStream(
                  choices
                    .map((choice) => choice.stream)
                    .filter((stream) =>
                      selection.playback.stream.isNativeTorrent
                        ? stream.isNativeTorrent
                        : stream.isNativeMedia,
                    ),
                  selection.playback.stream,
                );
                return (
                  choices.find((choice) => choice.stream === stream) || null
                );
              }}
              onLoadSeason={onLoadSeason}
              episodeTitle={episodeTitle}
              onStarted={markStarted}
              onProgress={recordProgress}
              onEnded={
                details.addonType === "series" ? finishPlayback : undefined
              }
              preferences={remembered.current}
              onPreferences={(tracks) => {
                savePlaybackPreferences(details, { tracks });
                remembered.current = readPlaybackPreferences(details);
              }}
              onClose={close}
              resumePosition={selection.resumePosition}
              onRetry={() => {
                close();
                setProviderChoice(active.id);
                setProviderRevision((value) => value + 1);
              }}
            />
          )}
        </Playback>
      )}
    </section>
  );
}
