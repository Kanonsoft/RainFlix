import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { ArrowLeft, LoaderCircle, Maximize, Play, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { api, config, trackEvent } from "../lib/api.js";
import { supports, useAddons } from "../lib/addons.js";
import AddonPlayer from "./AddonPlayer.jsx";
import AddonSources from "./AddonSources.jsx";

const ignorePlayback = () => {};

function requestFullscreen(element) {
  try {
    const request =
      element?.requestFullscreen || element?.webkitRequestFullscreen;
    Promise.resolve(request?.call(element)).catch(() => {});
  } catch {
    // The fixed viewport player remains usable when native fullscreen is unavailable.
  }
}

function FramePlayer({ source, title, onStarted }) {
  const frame = useRef(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const origin = new URL(source.url).origin;
    const receive = (event) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "PLAYER_EVENT" &&
        ["play", "playing"].includes(
          String(event.data?.data?.event || "").toLowerCase(),
        )
      )
        onStarted();
    };
    let timer;
    const blur = () => {
      timer = window.setTimeout(() => {
        if (document.activeElement === frame.current) onStarted();
      }, 0);
    };
    window.addEventListener("message", receive);
    window.addEventListener("blur", blur);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("message", receive);
      window.removeEventListener("blur", blur);
    };
  }, [source.url, onStarted]);
  return (
    <div id="playerShell" className="relative h-full min-h-0 w-full bg-black">
      {loading && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          role="status"
        >
          <LoaderCircle
            className="h-8 w-8 animate-spin text-sky-300"
            aria-label="Loading player"
          />
        </div>
      )}
      <iframe
        ref={frame}
        className="absolute inset-0 h-full w-full border-0"
        src={source.url}
        title={`${title} ${source.label} player`}
        allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *"
        allowFullScreen
        referrerPolicy="origin"
        onLoad={() => setLoading(false)}
        onPointerDown={onStarted}
      />
    </div>
  );
}

function Playback({ source, details, onStarted, onClose, children }) {
  const root = useRef(null);
  const closeButton = useRef(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef(null);
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
    closeButton.current?.focus({ preventScroll: true });
    if (shell) {
      shell.inert = true;
      shell.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";
    let enteredFullscreen = false;
    const fullscreenChange = () => {
      const element =
        document.fullscreenElement || document.webkitFullscreenElement;
      if (element) enteredFullscreen = true;
      else if (enteredFullscreen) onClose();
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
      if (element === container || element?.closest?.("#fullscreenPlayback")) {
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
  }, [onClose]);

  return createPortal(
    <div
      id="fullscreenPlayback"
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={`${details.title} playback`}
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
          title={details.title}
          onStarted={onStarted}
        />
      )}
      <div className="pointer-events-none absolute right-3 top-3 z-40 flex gap-2">
        <button
          className="player-overlay-control pointer-events-auto grid h-11 w-11 place-items-center rounded-lg bg-black/75 text-white focus-visible:ring-2 focus-visible:ring-sky-400"
          aria-label="Enter fullscreen"
          title="Enter fullscreen"
          onClick={() => requestFullscreen(root.current)}
        >
          <Maximize className="h-5 w-5" aria-hidden="true" />
        </button>
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
    </div>,
    document.body,
  );
}

export default function TitlePlayers({
  ref,
  details,
  season,
  episode,
  canPlay,
  onStarted,
  trailerKey,
  episodePicker,
  episodeLabel,
  episodeTitle,
  episodeChosen = true,
  onBackToEpisodes,
}) {
  const installed = useAddons();
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState(null);
  const [providerChoice, setProviderChoice] = useState("");
  const [providerRevision, setProviderRevision] = useState(0);
  const [sourcesVisible, setSourcesVisible] = useState(false);
  const started = useRef(false);
  const sourceBack = useRef(null);
  const sourcePanel = useRef(null);
  const providerButtons = useRef(new Map());
  const sources = useMemo(() => {
    const tmdb = details.tmdbDetails;
    return [
      ...(tmdb
        ? api.buildStreamSources({
            mediaType: tmdb.mediaType,
            id: tmdb.id,
            season,
            episode,
          })
        : []),
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
  }, [details, season, episode, installed]);
  const chosenProvider = sources.find(
    (source) => source.id === providerChoice && !source.url,
  );
  const chosenProviderId = chosenProvider?.id;
  const showSources = Boolean(chosenProvider && sourcesVisible);
  const hasEpisodePicker = Boolean(episodePicker);
  const revealSources = useCallback(() => setSourcesVisible(true), []);
  const trailer = useMemo(
    () =>
      trailerKey
        ? {
            id: "trailer",
            label: "Trailer",
            url: `https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&controls=1&playsinline=1&rel=0`,
          }
        : null,
    [trailerKey],
  );
  const active =
    selection &&
    (selection.id === "trailer"
      ? trailer
      : sources.find((source) => source.id === selection.id));
  const close = useCallback(() => {
    setSelection(null);
    navigate(-1);
  }, [navigate]);
  const markStarted = useCallback(() => {
    if (!started.current) {
      started.current = true;
      onStarted?.();
    }
  }, [onStarted]);
  const start = (source, playback) => {
    const token = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const params = new URLSearchParams(location.search);
    params.set("play", "1");
    // Mount and request fullscreen during the provider click's user activation.
    flushSync(() => {
      setSelection({ id: source.id, token, playback });
      navigate(
        { pathname: location.pathname, search: `?${params}` },
        { state: { rainflixPlayback: token } },
      );
    });
    requestFullscreen(document.getElementById("fullscreenPlayback"));
    trackEvent("player-source", { source: source.addon ? "addon" : source.id });
  };
  useImperativeHandle(ref, () => ({
    playTrailer() {
      if (!trailer) return;
      setProviderChoice("");
      setSourcesVisible(false);
      start(trailer);
    },
  }));
  useEffect(() => {
    if (chosenProviderId && showSources) {
      sourceBack.current?.focus({ preventScroll: true });
      if (sourcePanel.current) sourcePanel.current.scrollTop = 0;
    }
  }, [chosenProviderId, showSources]);
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
    });
    providerButtons.current.get(id)?.focus({ preventScroll: true });
    if (sourcePanel.current) sourcePanel.current.scrollTop = 0;
  };
  // Stop on pop immediately, even when React coalesces rapid router transitions.
  useEffect(() => {
    const stop = () => setSelection(null);
    window.addEventListener("popstate", stop);
    return () => window.removeEventListener("popstate", stop);
  }, []);
  useEffect(() => {
    if (selection && !active) setSelection(null);
  }, [selection, active]);
  return (
    <section
      aria-labelledby="titlePlayersHeading"
      className="flex max-h-[min(42rem,75svh)] min-h-0 flex-col"
    >
      <div className="mb-3 flex min-h-11 shrink-0 items-center gap-3">
        {(showSources || (episodePicker && episodeChosen)) && (
          <button
            ref={sourceBack}
            type="button"
            aria-label={
              showSources
                ? "Back to players"
                : `Back to ${episodeLabel.toLowerCase()}`
            }
            title={
              showSources
                ? "Back to players"
                : `Back to ${episodeLabel.toLowerCase()}`
            }
            onClick={
              showSources
                ? backToPlayers
                : () => {
                    setProviderChoice("");
                    setSourcesVisible(false);
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
            {!episodeChosen
              ? episodeLabel
              : showSources
                ? chosenProvider.label
                : "Players"}
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
        {!episodeChosen ? (
          episodePicker
        ) : showSources ? null : !canPlay ? (
          <p role="status" className="text-sm text-slate-400">
            No episodes are available for this title.
          </p>
        ) : !sources.length ? (
          <p role="status" className="text-sm text-slate-400">
            No enabled stream add-on supports this title.
          </p>
        ) : (
          <div className="grid min-w-0 gap-1">
            {sources.map((source) => (
              <button
                key={source.id}
                ref={(node) => {
                  if (node) providerButtons.current.set(source.id, node);
                  else providerButtons.current.delete(source.id);
                }}
                type="button"
                className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition hover:bg-white/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                onClick={() => {
                  if (source.url) {
                    setProviderChoice("");
                    start(source);
                  } else {
                    setProviderChoice(source.id);
                    setSourcesVisible(false);
                    setProviderRevision((value) => value + 1);
                  }
                }}
                aria-label={`Play with ${source.label}`}
              >
                {source.id === providerChoice ? (
                  <LoaderCircle
                    className="h-4 w-4 shrink-0 animate-spin text-sky-300"
                    aria-hidden="true"
                  />
                ) : (
                  <Play
                    className="h-4 w-4 shrink-0 text-sky-300"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0 break-words">{source.label}</span>
                {source.id === providerChoice && (
                  <span
                    role="status"
                    className="ml-auto text-xs font-normal text-slate-400"
                  >
                    Finding streams
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {chosenProvider && episodeChosen && (
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
              onReady={revealSources}
              visible={showSources}
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
          source={active}
          details={details}
          onStarted={active.id === "trailer" ? ignorePlayback : markStarted}
          onClose={close}
        >
          {selection.playback && (
            <AddonPlayer
              {...selection.playback}
              season={season}
              episode={episode}
              onStarted={markStarted}
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
