import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize, Play } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { MediaGrid } from "../components/MediaCard.jsx";
import TitleArtwork from "../components/TitleArtwork.jsx";
import { useDetails } from "../components/details/DetailsProvider.jsx";
import { api, imageFallback, watchPath } from "../lib/api.js";

const PLAYER_STORAGE_KEY = "rainflix:player-source";

function WatchSkeleton() {
  return (
    <div className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-4 md:p-8">
      <div className="space-y-5">
        <div className="aspect-video w-full animate-pulse rounded-xl bg-blue-950/50" />
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="h-6 w-48 animate-pulse rounded bg-blue-950/60" />
            <div className="h-20 animate-pulse rounded-lg bg-blue-950/40" />
            <div className="h-20 animate-pulse rounded-lg bg-blue-950/40" />
          </div>
          <div className="h-40 animate-pulse rounded-xl bg-blue-950/40" />
        </div>
      </div>
    </div>
  );
}

function WatchHero({ details, episode, onMoreInfo, onScrollPlayer, season }) {
  const image =
    details.backdrop ||
    details.poster ||
    imageFallback(details.title, true);

  return (
    <section className="hidden overflow-hidden rounded-xl border border-blue-900/70 bg-blue-950/20 shadow-2xl shadow-black/40 md:block">
      <article className="relative h-[28rem] overflow-hidden">
        <img
          className="absolute inset-0 h-full w-full object-cover opacity-85"
          src={image}
          alt=""
          draggable="false"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = imageFallback(details.title, true);
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/82 to-slate-950/20" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent" />

        <div className="relative z-10 flex h-full max-w-4xl flex-col justify-end p-8">
          <div className="mb-4 flex items-center gap-3 text-sm text-slate-300">
            <span className="rounded-full bg-sky-400/15 px-3 py-1 font-black uppercase text-sky-300">
              {api.mediaLabel(details.mediaType)}
            </span>
            <span>{details.year}</span>
            <span className="rounded-full bg-blue-500/20 px-3 py-1 font-black text-sky-200">
              {details.rating}
            </span>
            {details.runtime ? <span>{details.runtime}</span> : null}
          </div>

          <h1 className="max-w-3xl leading-none text-slate-50">
            <TitleArtwork
              logo={details.logo}
              title={details.title}
              imageClassName="title-logo max-h-24 w-auto max-w-[min(30rem,78vw)] object-contain object-left lg:max-h-32"
              fallbackClassName="text-5xl font-black lg:text-6xl"
            />
          </h1>

          <p className="mt-5 line-clamp-4 max-w-2xl text-base leading-7 text-slate-300">
            {details.synopsis}
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-6 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-500/20 transition duration-200 hover:bg-sky-300 focus-visible:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25"
              type="button"
              onClick={onScrollPlayer}
            >
              <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
              {details.mediaType === "tv"
                ? `Start watching S${season}:E${episode}`
                : "Start watching movie"}
            </button>
            <button
              className="rounded-lg border border-white/20 bg-slate-950/55 px-6 py-3 text-sm font-black text-slate-50 backdrop-blur transition duration-200 hover:border-sky-400/70 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
              type="button"
              onClick={onMoreInfo}
            >
              More info
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}

function DetailsPanel({
  details,
  episode,
  onMoreInfo,
  season,
  selectedEpisode,
}) {
  return (
    <aside className="h-fit rounded-xl border border-blue-900/70 bg-blue-950/20 p-4 md:p-5">
      <div className="flex gap-4">
        <img
          className="h-32 w-24 shrink-0 rounded-lg object-cover"
          src={
            details.poster ||
            details.backdrop ||
            imageFallback(details.title)
          }
          alt=""
          draggable="false"
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.src = imageFallback(details.title);
          }}
        />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wider text-sky-300">
            {api.mediaLabel(details.mediaType)}
          </p>
          <h2 className="mt-1 text-xl font-black leading-tight text-slate-50">
            {details.title}
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            {details.year} &middot; {details.rating} rating
          </p>
        </div>
      </div>

      <button
        className="mt-4 text-sm font-black text-sky-300 transition duration-200 hover:text-sky-200 focus-visible:outline-none focus-visible:underline"
        type="button"
        onClick={onMoreInfo}
      >
        More info
      </button>

      <div className="mt-5 border-t border-blue-900/70 pt-5">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
          Synopsis
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          {details.synopsis}
        </p>
      </div>

      {details.mediaType === "tv" && selectedEpisode ? (
        <div className="mt-5 border-t border-blue-900/70 pt-5">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">
            Current episode
          </h3>
          <p className="mt-3 font-bold text-slate-100">
            S{season}:E{episode} {selectedEpisode.title}
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            {selectedEpisode.synopsis}
          </p>
        </div>
      ) : null}
    </aside>
  );
}

function Player({
  details,
  episode,
  playerSource,
  season,
  setPlayerSource,
}) {
  const [frameLoading, setFrameLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const frameRef = useRef(null);
  const sources = useMemo(
    () =>
      api.buildStreamSources({
        mediaType: details.mediaType,
        id: details.id,
        season,
        episode,
      }),
    [details.id, details.mediaType, episode, season],
  );
  const activeSource =
    sources.find((source) => source.id === playerSource) || sources[0];

  useEffect(() => {
    if (activeSource && activeSource.id !== playerSource) {
      setPlayerSource(activeSource.id);
    }
  }, [activeSource, playerSource, setPlayerSource]);

  useEffect(() => {
    setFrameLoading(true);
  }, [activeSource?.url]);

  useEffect(() => {
    const update = () => {
      const current =
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        null;
      setFullscreen(current === frameRef.current);
    };

    document.addEventListener("fullscreenchange", update);
    document.addEventListener("webkitfullscreenchange", update);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("webkitfullscreenchange", update);
    };
  }, []);

  const toggleFullscreen = async () => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    try {
      if (
        document.fullscreenElement ||
        document.webkitFullscreenElement
      ) {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else {
          document.webkitExitFullscreen?.();
        }
      } else if (frame.requestFullscreen) {
        await frame.requestFullscreen();
      } else {
        frame.webkitRequestFullscreen?.();
      }
    } catch {
      // Embedded players can still expose their own fullscreen controls.
    }
  };

  if (!activeSource) {
    return (
      <div className="aspect-video w-full bg-black p-6 text-sm text-slate-400">
        No streaming sources are configured.
      </div>
    );
  }

  return (
    <>
      <section
        id="playerShell"
        className="overflow-hidden rounded-xl border border-blue-900/70 bg-slate-950 shadow-2xl shadow-black/35"
        aria-label="Streaming player"
      >
        <div
          className="player-frame group relative aspect-video w-full overflow-hidden bg-black"
          ref={frameRef}
        >
          {frameLoading ? (
            <div
              className="absolute inset-0 grid place-items-center bg-slate-950"
              aria-hidden="true"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-950 border-t-sky-400" />
            </div>
          ) : null}
          <button
            className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-lg border border-white/15 bg-black/70 text-white opacity-0 shadow-xl backdrop-blur transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-black/90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            aria-pressed={fullscreen}
            title={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            <Maximize className="h-5 w-5" aria-hidden="true" />
          </button>
          <iframe
            className="absolute inset-0 h-full w-full bg-black"
            src={activeSource.url}
            title={`${details.title} ${activeSource.label} player`}
            allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *"
            allowFullScreen
            frameBorder="0"
            loading="eager"
            referrerPolicy="origin"
            onLoad={() => setFrameLoading(false)}
          />
        </div>
      </section>

      <section
        className="mt-3 rounded-xl border border-blue-900/70 bg-blue-950/20 p-3 shadow-xl shadow-black/20 md:p-4"
        aria-label="Streaming sources"
      >
        <div className="flex items-center justify-between gap-4">
          <label
            className="text-xs font-black uppercase tracking-wider text-slate-400"
            htmlFor="playerSourceSelect"
          >
            Player
          </label>
          <select
            id="playerSourceSelect"
            className="min-w-0 max-w-xs flex-1 rounded-lg border border-blue-900/80 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-100 outline-none transition duration-200 hover:border-sky-500/70 focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10 sm:w-56 sm:flex-none"
            value={activeSource.id}
            onChange={(event) => setPlayerSource(event.target.value)}
            aria-label="Streaming player"
          >
            {sources.map((source) => (
              <option value={source.id} key={source.id}>
                {source.label}
              </option>
            ))}
          </select>
        </div>
      </section>
    </>
  );
}

function EpisodeSection({
  details,
  episode,
  onEpisodeChange,
  onSeasonChange,
  season,
  seasonDetails,
}) {
  if (details.mediaType !== "tv") {
    return null;
  }

  return (
    <section className="mt-6 md:mt-8" aria-labelledby="episodesTitle">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 id="episodesTitle" className="text-2xl font-black text-slate-50">
            Episodes
          </h2>
          {seasonDetails?.synopsis ? (
            <p className="mt-2 text-sm text-slate-400">
              {seasonDetails.synopsis}
            </p>
          ) : null}
        </div>

        <label className="flex items-center gap-3 text-sm font-bold text-slate-300">
          Season
          <select
            className="h-10 rounded-lg border border-blue-900/70 bg-blue-950/30 px-3 text-sm text-slate-100 outline-none transition focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
            value={season}
            onChange={(event) => onSeasonChange(event.target.value)}
          >
            {details.seasons.map((seasonItem) => (
              <option
                value={seasonItem.seasonNumber}
                key={seasonItem.seasonNumber}
              >
                {seasonItem.name} ({seasonItem.episodeCount})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="max-h-[24rem] overflow-y-auto rounded-xl border border-blue-900/70 bg-blue-950/20 p-2 md:max-h-[32rem]">
        <div className="grid grid-cols-1 gap-2">
          {(seasonDetails?.episodes || []).map((episodeItem) => {
            const active = episodeItem.episodeNumber === episode;

            return (
              <button
                className={`group flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${
                  active
                    ? "border-sky-400 bg-sky-400/10"
                    : "border-blue-900/60 bg-slate-950/35 hover:border-sky-500/70 hover:bg-sky-400/10"
                }`}
                type="button"
                onClick={() => onEpisodeChange(episodeItem.episodeNumber)}
                key={episodeItem.episodeNumber}
              >
                <span className="grid h-9 w-14 shrink-0 place-items-center rounded-lg bg-sky-400/15 text-xs font-black text-sky-300">
                  EP {episodeItem.episodeNumber}
                </span>
                <span className="min-w-0 truncate font-black text-slate-50">
                  {episodeItem.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function WatchPage({ onBackdrop, onReady }) {
  const params = useParams();
  const navigate = useNavigate();
  const { openDetails } = useDetails();
  const mediaType = api.normalizeMediaType(params.mediaType);
  const id = params.id || "";
  const requestedSeason = Number.parseInt(params.season, 10) || 1;
  const requestedEpisode = Number.parseInt(params.episode, 10) || 1;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [details, setDetails] = useState(null);
  const [season, setSeason] = useState(requestedSeason);
  const [episode, setEpisode] = useState(requestedEpisode);
  const [seasonDetails, setSeasonDetails] = useState(null);
  const [similarItems, setSimilarItems] = useState([]);
  const [playerSource, setPlayerSourceState] = useState(() => {
    try {
      return window.localStorage.getItem(PLAYER_STORAGE_KEY) || "vidsrc";
    } catch {
      return "vidsrc";
    }
  });
  const requestId = useRef(0);

  const setPlayerSource = useCallback((source) => {
    setPlayerSourceState(source);

    try {
      window.localStorage.setItem(PLAYER_STORAGE_KEY, source);
    } catch {
      // Player preference remains optional when storage is unavailable.
    }
  }, []);

  useEffect(() => {
    const loadRequestId = ++requestId.current;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetails(null);
    setSimilarItems([]);
    setSeasonDetails(null);

    const load = async () => {
      if (!id) {
        throw new Error("Choose a movie or series from the catalog first.");
      }

      const detailsPromise = api.getDetails(mediaType, id);
      const similarPromise = api.getSimilar(mediaType, id, api.PAGE_SIZE);
      const nextDetails = await detailsPromise;

      if (!nextDetails) {
        throw new Error("RainFlix could not find metadata for this title.");
      }

      let nextSeason = requestedSeason;
      let nextEpisode = requestedEpisode;
      let nextSeasonDetails = null;

      if (nextDetails.mediaType === "tv") {
        const seasonExists = nextDetails.seasons.some(
          (item) => item.seasonNumber === nextSeason,
        );
        nextSeason = seasonExists
          ? nextSeason
          : nextDetails.seasons[0]?.seasonNumber || 1;
        nextSeasonDetails = await api.getSeasonDetails(
          nextDetails.id,
          nextSeason,
        );
        const episodeExists = nextSeasonDetails.episodes.some(
          (item) => item.episodeNumber === nextEpisode,
        );
        nextEpisode = episodeExists ? nextEpisode : 1;
      } else {
        nextSeason = 1;
        nextEpisode = 1;
      }

      const similarFeed = await similarPromise;

      if (
        cancelled ||
        loadRequestId !== requestId.current
      ) {
        return;
      }

      setDetails(nextDetails);
      setSeason(nextSeason);
      setEpisode(nextEpisode);
      setSeasonDetails(nextSeasonDetails);
      setSimilarItems(similarFeed?.items || []);
      setLoading(false);
      document.title = `${nextDetails.title} | RainFlix`;
      const backdrop =
        nextDetails.backdrop ||
        nextDetails.poster ||
        imageFallback(nextDetails.title, true);
      onBackdrop?.(backdrop);
      onReady?.([nextDetails.poster, nextDetails.backdrop]);

      if (
        nextSeason !== requestedSeason ||
        nextEpisode !== requestedEpisode
      ) {
        navigate(watchPath(nextDetails, nextSeason, nextEpisode), {
          replace: true,
        });
      }
    };

    load().catch((loadError) => {
      if (
        cancelled ||
        loadRequestId !== requestId.current
      ) {
        return;
      }

      setLoading(false);
      setError(loadError.message || "This title is unavailable.");
      onReady?.([]);
    });

    return () => {
      cancelled = true;
      requestId.current += 1;
    };
  }, [id, mediaType]);

  const selectedEpisode = seasonDetails?.episodes?.find(
    (item) => item.episodeNumber === episode,
  );

  const changeEpisode = (nextEpisode) => {
    const parsed = Number.parseInt(nextEpisode, 10) || 1;
    setEpisode(parsed);
    navigate(watchPath(details, season, parsed), { replace: true });
  };

  const changeSeason = async (nextSeason) => {
    const parsed = Number.parseInt(nextSeason, 10) || 1;
    const loadRequestId = ++requestId.current;
    setSeason(parsed);
    setEpisode(1);

    try {
      const nextSeasonDetails = await api.getSeasonDetails(details.id, parsed);

      if (loadRequestId !== requestId.current) {
        return;
      }

      setSeasonDetails(nextSeasonDetails);
      navigate(watchPath(details, parsed, 1), { replace: true });
    } catch {
      // Keep the previous episode list if this season cannot be loaded.
    }
  };

  if (loading) {
    return (
      <section
        className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-10 md:py-8 lg:px-12"
        aria-label="Watch title"
      >
        <WatchSkeleton />
      </section>
    );
  }

  if (error || !details) {
    return (
      <section
        className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-10 md:py-8 lg:px-12"
        aria-label="Watch title"
      >
        <div className="rounded-xl border border-blue-900/70 bg-blue-950/20 p-7 text-slate-400">
          <h1 className="mb-2 text-2xl font-black text-slate-50">
            Title unavailable
          </h1>
          <p>{error}</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-4 py-5 md:px-10 md:py-8 lg:px-12"
      aria-label="Watch title"
    >
      <WatchHero
        details={details}
        episode={episode}
        season={season}
        onMoreInfo={() => openDetails(details.mediaType, details.id)}
        onScrollPlayer={() =>
          document.querySelector("#playerShell")?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          })
        }
      />

      <section className="mt-0 grid grid-cols-1 gap-5 md:mt-8 md:grid-cols-[minmax(0,1fr)_360px] md:gap-6">
        <div className="min-w-0">
          <Player
            details={details}
            episode={episode}
            playerSource={playerSource}
            season={season}
            setPlayerSource={setPlayerSource}
          />
          <EpisodeSection
            details={details}
            episode={episode}
            onEpisodeChange={changeEpisode}
            onSeasonChange={changeSeason}
            season={season}
            seasonDetails={seasonDetails}
          />
        </div>

        <DetailsPanel
          details={details}
          episode={episode}
          onMoreInfo={() => openDetails(details.mediaType, details.id)}
          season={season}
          selectedEpisode={selectedEpisode}
        />
      </section>

      {similarItems.length ? (
        <section className="mt-10" aria-labelledby="similarTitle">
          <h2
            id="similarTitle"
            className="mb-5 text-3xl font-black text-slate-50"
          >
            More like this
          </h2>
          <MediaGrid items={similarItems.slice(0, api.PAGE_SIZE)} />
        </section>
      ) : null}
    </section>
  );
}
