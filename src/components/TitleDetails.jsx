import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, Check, Play, Share2 } from "lucide-react";
import { Link, useLocation } from "react-router";
import { api, imageFallback, trackEvent } from "../lib/api.js";
import { usePageMetadata } from "../lib/metadata.js";
import { useLibrary } from "./library/LibraryProvider.jsx";
import EpisodeList from "./EpisodeList.jsx";
import RelatedCarousel from "./RelatedCarousel.jsx";
import TitleArtwork from "./TitleArtwork.jsx";
import TitlePlayers from "./TitlePlayers.jsx";
import { shareBaseUrl } from "../platform/index.js";
import { getTmdbTitleMeta } from "../lib/addon-catalogs.js";

const actionClass =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-4 text-sm font-bold transition hover:border-sky-400 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400";
const linkClass =
  "text-sky-200 underline decoration-white/20 underline-offset-4 hover:decoration-sky-300 focus-visible:outline-sky-300";

function relatedPath(type, item) {
  return `/search?${new URLSearchParams({ q: item.name, [type]: item.id })}`;
}

function Content({
  meta,
  requestedVideo,
  onVideoChange,
  seriesProvider,
  onSeriesProviderChange,
}) {
  const location = useLocation();
  const { isInMyList, toggleMyList, recordViewed, markWatched } = useLibrary();
  const [shareStatus, setShareStatus] = useState("");
  const [selectionStep, setSelectionStep] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [episodeChosen, setEpisodeChosen] = useState(
    () => new URLSearchParams(location.search).get("resume") === "1",
  );
  const players = useRef(null);
  const tmdb = meta.tmdbDetails;
  const libraryTitle = {
    ...(tmdb || { ...meta, detailPath: location.pathname }),
    seasonEpisodeCounts:
      meta.tmdbSeasons ||
      [...new Set((meta.videos || []).map((video) => video.season))].map(
        (seasonNumber) => ({
          seasonNumber,
          episodeCount: (meta.videos || []).filter(
            (video) => video.season === seasonNumber,
          ).length,
        }),
      ),
  };
  const saved = isInMyList(libraryTitle);
  const [extraVideos, setExtraVideos] = useState([]);
  useEffect(() => {
    if (!tmdb || !meta.tmdbSeasons?.length) return;
    const controller = new AbortController();
    const load = async () => {
      for (const item of meta.tmdbSeasons) {
        if (controller.signal.aborted) return;
        if (item.seasonNumber === meta.selectedSeason) continue;
        try {
          const other = await getTmdbTitleMeta(
            tmdb,
            item.seasonNumber,
            controller.signal,
          );
          if (!controller.signal.aborted)
            setExtraVideos((current) => [
              ...current.filter((video) => video.season !== item.seasonNumber),
              ...other.videos,
            ]);
        } catch {
          /* A missing season must not prevent playback. */
        }
      }
    };
    load();
    return () => controller.abort();
  }, [tmdb, meta.tmdbSeasons, meta.selectedSeason]);
  const videos = useMemo(
    () => (meta.isLive ? [] : meta.videos || []),
    [meta.isLive, meta.videos],
  );
  const playerEpisodes = useMemo(
    () =>
      [
        ...videos,
        ...extraVideos.filter(
          (video) => !videos.some((item) => item.id === video.id),
        ),
      ]
        .map((video) => ({
          id: video.id,
          season: video.season,
          episode: video.episode,
          sourceSeasonNumber: video.sourceSeasonNumber,
          sourceEpisodeNumber: video.sourceEpisodeNumber,
          title: video.title,
          date: video.releaseDate || video.date || "",
          image: video.image || meta.backdrop || meta.poster,
          streams: video.streams,
        }))
        .sort(
          (a, b) =>
            (a.season ?? 0) - (b.season ?? 0) ||
            (a.episode ?? 0) - (b.episode ?? 0),
        ),
    [videos, extraVideos, meta.backdrop, meta.poster],
  );
  const selectedVideo =
    videos.find((video) => video.id === requestedVideo) ||
    videos.find((video) => video.sourceVideoId === requestedVideo) ||
    videos.find((video) => video.id === meta.defaultVideoId) ||
    videos[0];
  const loadPlayerSeason = async (requestedSeason, signal) => {
    if (!tmdb)
      return playerEpisodes.filter((item) => item.season === requestedSeason);
    const other = await getTmdbTitleMeta(tmdb, requestedSeason, signal);
    if (signal?.aborted) return [];
    setExtraVideos((current) => [
      ...current.filter((item) => item.season !== requestedSeason),
      ...other.videos,
    ]);
    return other.videos.map((item) => ({
      ...item,
      date: item.releaseDate || "",
    }));
  };
  const continueEpisode = async (signal) => {
    if (meta.addonType !== "series" || !selectedVideo) return false;
    const currentSeason = selectedVideo.season ?? 1;
    const candidates = [...new Set([currentSeason, ...seasons])]
      .filter((value) => value >= currentSeason)
      .sort((a, b) => a - b);
    for (const value of candidates) {
      const items = await loadPlayerSeason(value, signal);
      if (signal.aborted) return false;
      const next = items
        .filter(
          (item) =>
            item.season > currentSeason || item.episode > selectedVideo.episode,
        )
        .filter(
          (item) =>
            !item.releaseDate ||
            new Date(item.releaseDate).getTime() <= Date.now(),
        )
        .sort((a, b) => a.episode - b.episode)[0];
      if (next) {
        setEpisodeChosen(true);
        onVideoChange(String(next.id), true);
        return true;
      }
    }
    return false;
  };
  const seasons =
    meta.tmdbSeasons?.map((season) => season.seasonNumber) ||
    [
      ...new Set(
        videos.map((video) => video.season).filter((value) => value !== null),
      ),
    ].sort((a, b) => a - b);
  const selectedSeason =
    selectedVideo?.season ?? meta.selectedSeason ?? seasons[0];
  const episodeOptions = seasons.length
    ? videos.filter((video) => video.season === selectedSeason)
    : videos;
  const videoId = meta.isLive
    ? meta.addonId
    : selectedVideo?.id ||
      meta.defaultVideoId ||
      (meta.addonType !== "series" ? meta.addonId : "");
  const details = useMemo(
    () => ({
      ...meta,
      addonVideoId: videoId,
      sourceEpisodeNumber: selectedVideo?.sourceEpisodeNumber,
      sourceSeasonNumber: selectedVideo?.sourceSeasonNumber,
      addonStreams: selectedVideo?.streams,
    }),
    [meta, videoId, selectedVideo],
  );
  const season = selectedVideo?.season ?? 1;
  const episode = selectedVideo?.episode ?? 1;
  const hasEpisodes = seasons.length > 0 || videos.length > 0;
  const trailerKey = /^[A-Za-z0-9_-]+$/.test(meta.trailerKey || "")
    ? meta.trailerKey
    : "";

  useEffect(() => {
    let cancelled = false;
    setSimilar([]);
    if (tmdb)
      api
        .getSimilar(tmdb.mediaType, tmdb.id, api.PAGE_SIZE)
        .then((feed) => {
          if (!cancelled) setSimilar(feed?.items || []);
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tmdb]);

  const share = async () => {
    const params = new URLSearchParams(location.search);
    params.delete("play");
    const url = new URL(shareBaseUrl());
    url.hash = `${location.pathname}${params.size ? `?${params}` : ""}`;
    const text = [meta.title, meta.synopsis, url.href]
      .filter(Boolean)
      .join("\n\n");
    try {
      if (navigator.share) {
        await navigator.share({ text });
        setShareStatus("Shared");
      } else {
        await navigator.clipboard.writeText(text);
        setShareStatus("Share text copied");
      }
      trackEvent("title-share", { mediaType: meta.mediaType });
    } catch (error) {
      if (error.name !== "AbortError") setShareStatus("Sharing unavailable");
    }
  };

  return (
    <>
      <div className="grid min-w-0 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <article
          className={`min-w-0 ${selectionStep ? "hidden md:block" : ""}`}
        >
          <div className="grid min-w-0 gap-6 sm:grid-cols-[160px_minmax(0,1fr)]">
            <img
              className="aspect-[2/3] w-32 rounded-lg object-cover shadow-xl shadow-black/40 sm:w-40"
              src={meta.poster || imageFallback(meta.title)}
              alt={`${meta.title} poster`}
              draggable={false}
              onError={(event) => {
                event.currentTarget.onerror = null;
                event.currentTarget.src = imageFallback(meta.title);
              }}
            />
            <div className="min-w-0">
              <h1 className="min-w-0" aria-label={meta.title}>
                <TitleArtwork
                  logo={meta.logo}
                  title={meta.title}
                  imageClassName="max-h-24 w-auto max-w-full object-contain object-left"
                  fallbackClassName="break-words text-2xl font-bold md:text-3xl"
                />
              </h1>
              <p className="mt-3 text-sm text-sky-200">
                {[
                  meta.typeLabel,
                  meta.year,
                  meta.rating && meta.rating !== "NR"
                    ? `${meta.rating}/10`
                    : "",
                  meta.duration || meta.runtime,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {meta.tagline && (
                <p className="mt-4 text-sm italic text-slate-400">
                  {meta.tagline}
                </p>
              )}
              <p
                id="titleSynopsis"
                className="mt-4 whitespace-pre-line break-words text-sm leading-7 text-slate-300"
              >
                {meta.synopsis}
              </p>
              <div
                className="mt-5 flex flex-wrap items-center gap-3"
                role="group"
                aria-label="Title actions"
              >
                {libraryTitle && (
                  <button
                    className={actionClass}
                    type="button"
                    aria-pressed={saved}
                    onClick={() => toggleMyList(libraryTitle)}
                  >
                    {saved ? (
                      <Check className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Bookmark className="h-4 w-4" aria-hidden="true" />
                    )}
                    {saved ? "In My List" : "My List"}
                  </button>
                )}
                <button className={actionClass} type="button" onClick={share}>
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  Share
                </button>
                {trailerKey && (
                  <button
                    className={actionClass}
                    type="button"
                    onClick={() => players.current?.playTrailer()}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Play trailer
                  </button>
                )}
              </div>
              <p role="status" className="mt-2 text-xs text-sky-300">
                {shareStatus}
              </p>
            </div>
          </div>
          {(meta.releaseDate || meta.status) && (
            <dl className="mt-7 flex flex-wrap gap-x-10 gap-y-4 border-y border-white/10 py-4 text-sm">
              {meta.releaseDate && (
                <div>
                  <dt className="text-slate-400">Release date</dt>
                  <dd className="mt-1">{meta.releaseDate}</dd>
                </div>
              )}
              {meta.status && (
                <div>
                  <dt className="text-slate-400">Status</dt>
                  <dd className="mt-1">{meta.status}</dd>
                </div>
              )}
            </dl>
          )}
          {!!meta.genres?.length && (
            <section className="mt-7" aria-label="Genres">
              <h2 className="text-base font-bold">Genres</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
                {meta.genreLinks?.length
                  ? meta.genreLinks.map((genre) => (
                      <Link
                        className={linkClass}
                        key={genre.slug}
                        to={`/browse?genre=${encodeURIComponent(genre.slug)}`}
                        aria-label={`Browse ${genre.name} movies and series`}
                      >
                        {genre.name}
                      </Link>
                    ))
                  : meta.genres.map((genre) => (
                      <span key={genre} className="text-slate-300">
                        {genre}
                      </span>
                    ))}
              </div>
            </section>
          )}
          {!!meta.cast?.length && (
            <section className="mt-7" aria-label="Cast">
              <h2 className="text-base font-bold">Cast</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
                {meta.cast.map((person) =>
                  typeof person === "string" ? (
                    <span key={person} className="text-slate-300">
                      {person}
                    </span>
                  ) : (
                    <Link
                      className={linkClass}
                      key={person.id}
                      to={relatedPath("person", person)}
                      aria-label={`View movies and series featuring ${person.name}`}
                    >
                      {person.name}
                    </Link>
                  ),
                )}
              </div>
            </section>
          )}
          {!!meta.director?.length && (
            <p className="mt-6 text-sm text-slate-300">
              Director: {meta.director.join(", ")}
            </p>
          )}
          {!!meta.productionCompanies?.length && (
            <section className="mt-7" aria-label="Production companies">
              <h2 className="text-base font-bold">Production companies</h2>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-3 text-sm">
                {meta.productionCompanies.map((company) => (
                  <Link
                    className={linkClass}
                    key={company.id}
                    to={relatedPath("company", company)}
                    aria-label={`View movies and series from ${company.name}`}
                  >
                    {company.name}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
        <aside
          className="min-w-0 border-t border-white/15 pt-6 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0"
          aria-label="Playback options"
        >
          <TitlePlayers
            onSelectionStepChange={setSelectionStep}
            ref={players}
            key={`${meta.id}:${videoId}`}
            details={details}
            season={season}
            episode={episode}
            seasons={seasons}
            episodes={playerEpisodes}
            onLoadSeason={loadPlayerSeason}
            onEpisodeEnded={continueEpisode}
            currentVideoId={selectedVideo?.id}
            onEpisodeSelect={(id, autoplay = true, playback) => {
              const video = playerEpisodes.find(
                (item) => String(item.id) === id,
              );
              if (video && video.id !== selectedVideo?.id) {
                setEpisodeChosen(video.id);
                onVideoChange(video.id, autoplay, playback);
              }
            }}
            trailerKey={trailerKey}
            episodeChosen={
              !hasEpisodes ||
              episodeChosen === true ||
              episodeChosen === selectedVideo?.id
            }
            seriesProvider={seriesProvider}
            onSeriesProviderChange={onSeriesProviderChange}
            onBackToEpisodes={() => setEpisodeChosen(false)}
            episodeLabel={meta.addonType === "series" ? "Episodes" : "Videos"}
            episodeTitle={selectedVideo?.title}
            episodePicker={
              hasEpisodes && (
                <EpisodeList
                  key={selectedSeason ?? "videos"}
                  videos={episodeOptions}
                  seasons={seasons}
                  season={selectedSeason}
                  selectedVideo={selectedVideo}
                  isSeries={meta.addonType === "series"}
                  onVideoChange={(id) => {
                    setEpisodeChosen(id);
                    if (id !== selectedVideo?.id) onVideoChange(id, false);
                  }}
                  onSeasonChange={(value) => {
                    const id = meta.tmdbSeasons
                      ? `${meta.imdbId || meta.id}:${value}:1`
                      : videos.find((video) => video.season === value)?.id;
                    if (id) onVideoChange(id);
                  }}
                />
              )
            }
            canPlay={meta.addonType !== "series" || Boolean(selectedVideo)}
            onStarted={() => {
              recordViewed(
                {
                  ...libraryTitle,
                  sourceEpisodeNumber: selectedVideo?.sourceEpisodeNumber,
                  sourceSeasonNumber: selectedVideo?.sourceSeasonNumber,
                },
                season,
                episode,
                videoId,
              );
            }}
            onCompleted={() =>
              markWatched(
                {
                  ...libraryTitle,
                  sourceEpisodeNumber: selectedVideo?.sourceEpisodeNumber,
                  sourceSeasonNumber: selectedVideo?.sourceSeasonNumber,
                },
                season,
                episode,
                videoId,
                playerEpisodes,
              )
            }
          />
        </aside>
      </div>
      {similar.length > 0 && (
        <div className={selectionStep ? "hidden md:block" : ""}>
          <RelatedCarousel items={similar} />
        </div>
      )}
    </>
  );
}

export default function TitleDetails({ feed, onRetry, onBackdrop, ...props }) {
  const meta = feed.meta;
  const [providers, setProviders] = useState({});
  useEffect(() => {
    if (meta?.backdrop || meta?.poster)
      onBackdrop?.(meta.backdrop || meta.poster);
  }, [meta, onBackdrop]);
  usePageMetadata({
    title: meta?.title || "Title details",
    description: meta?.synopsis || "",
    image: meta?.backdrop || meta?.poster || "",
  });
  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-10 md:py-12 lg:px-12"
      aria-label="Title details"
    >
      {feed.loading ? (
        <div role="status" className="py-12 text-slate-400">
          Loading title details...
        </div>
      ) : feed.error || !meta ? (
        <div role="alert">
          <p>{feed.error || "No metadata is available for this title."}</p>
          <button className={`${actionClass} mt-4`} onClick={onRetry}>
            Retry details
          </button>
        </div>
      ) : (
        <Content
          key={`${meta.mediaType}:${meta.id}`}
          meta={meta}
          {...props}
          seriesProvider={providers[meta.id] || ""}
          onSeriesProviderChange={(value) =>
            setProviders((current) => ({ ...current, [meta.id]: value }))
          }
        />
      )}
    </section>
  );
}
