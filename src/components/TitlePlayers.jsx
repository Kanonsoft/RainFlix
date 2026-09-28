import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { LoaderCircle, Maximize, Play, X } from "lucide-react";
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
  details,
  season,
  episode,
  canPlay,
  onStarted,
  trailerKey,
}) {
  const installed = useAddons();
  const location = useLocation();
  const navigate = useNavigate();
  const [selection, setSelection] = useState(null);
  const [providerChoice, setProviderChoice] = useState("");
  const [providerRevision, setProviderRevision] = useState(0);
  const started = useRef(false);
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
    <section aria-labelledby="titlePlayersHeading">
      {trailer && (
        <button
          type="button"
          className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-bold hover:border-sky-400 focus-visible:ring-2 focus-visible:ring-sky-400"
          onClick={() => {
            setProviderChoice("");
            start(trailer);
          }}
        >
          <Play className="h-4 w-4" aria-hidden="true" />
          Play trailer
        </button>
      )}
      <h2 id="titlePlayersHeading" className="mb-3 text-lg font-bold">
        Players
      </h2>
      {!canPlay ? (
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
              type="button"
              className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-lg px-3 text-left text-sm font-bold transition hover:bg-white/10 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              onClick={() => {
                if (source.url) {
                  setProviderChoice("");
                  start(source);
                } else {
                  setProviderChoice(source.id);
                  setProviderRevision((value) => value + 1);
                }
              }}
              aria-label={`Play with ${source.label}`}
              aria-expanded={
                !source.url ? source.id === providerChoice : undefined
              }
            >
              <Play
                className="h-4 w-4 shrink-0 text-sky-300"
                aria-hidden="true"
              />
              <span className="min-w-0 break-words">{source.label}</span>
            </button>
          ))}
        </div>
      )}
      {chosenProvider && (
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
          onPlay={(playback) => start(chosenProvider, playback)}
        />
      )}
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
                setProviderRevision((value) => value + 1);
              }}
            />
          )}
        </Playback>
      )}
    </section>
  );
}
