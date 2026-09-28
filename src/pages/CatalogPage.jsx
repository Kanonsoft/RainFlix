import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import HeroCarousel from "../components/HeroCarousel.jsx";
import AddonCatalogRows from "../components/AddonCatalogRows.jsx";
import { MediaGrid } from "../components/MediaCard.jsx";
import { useLibrary } from "../components/library/LibraryProvider.jsx";
import { api, delay, preloadImage, watchPath } from "../lib/api.js";
import { usePageMetadata } from "../lib/metadata.js";

const BROWSE_ROWS_PER_BATCH = 5;
const TITLE_LOGO_WAIT_MS = 2600;

function feedItems(feed) {
  return Array.isArray(feed) ? feed : feed?.items || [];
}

function useBrowseColumns() {
  const getColumns = () => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      return 6;
    }

    if (window.matchMedia("(min-width: 640px)").matches) {
      return 3;
    }

    return 2;
  };
  const [columns, setColumns] = useState(getColumns);

  useEffect(() => {
    const update = () => setColumns(getColumns());
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return columns;
}

function sectionConfiguration({ filter, genre, year }) {
  const isGenre = Boolean(genre);
  const isYear = Boolean(year);
  const isHome = filter === "all" && !isGenre && !isYear;
  const isMovies = filter === "movie";
  const genreName = genre?.name || "Genre";
  const yearLabel = String(year || "");

  return {
    ariaLabel: isGenre
      ? `${genreName} movies and series`
      : isYear
        ? `${yearLabel} movies and series`
        : isHome
          ? "RainFlix home"
          : isMovies
            ? "Movies catalog"
            : "Series catalog",
    browseTitle: isGenre
      ? `Browse ${genreName}`
      : isYear
        ? `Browse ${yearLabel}`
        : isHome
          ? "Browse"
          : isMovies
            ? "Browse movies"
            : "Browse series",
    newestMoviesTitle: isGenre
      ? `Newest ${genreName} movies`
      : isYear
        ? `${yearLabel} movies`
        : "Newest movies",
    newestSeriesTitle: isGenre
      ? `Newest ${genreName} series`
      : isYear
        ? `${yearLabel} series`
        : "Newest series",
    showMovies: isGenre
      ? Boolean(genre.movieGenreIds.length)
      : isYear || isHome || isMovies,
    showSeries: isGenre
      ? Boolean(genre.tvGenreIds.length)
      : isYear || isHome || !isMovies,
    trendingTitle: isGenre
      ? `Popular ${genreName}`
      : isYear
        ? `Popular in ${yearLabel}`
        : isHome
          ? "Trending this week"
          : isMovies
            ? "Trending movies"
            : "Trending series",
  };
}

export default function CatalogPage({ mode = "home", onBackdrop, onReady }) {
  const params = useParams();
  const { recentlyViewed } = useLibrary();
  const genreSlug = mode === "genre" ? params.genre || "" : "";
  const genre = genreSlug ? api.getGenre(genreSlug) : null;
  const requestedYear =
    mode === "year" ? Number.parseInt(params.year, 10) || 0 : 0;
  const year = requestedYear
    ? Math.min(new Date().getFullYear(), Math.max(1900, requestedYear))
    : null;
  const filter = mode === "movies" ? "movie" : mode === "series" ? "tv" : "all";
  const config = sectionConfiguration({ filter, genre, year });
  const columns = useBrowseColumns();
  const routeKey = `${mode}:${genreSlug}:${year || ""}`;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);
  const [carouselItems, setCarouselItems] = useState([]);
  const [trending, setTrending] = useState([]);
  const [newestMovies, setNewestMovies] = useState([]);
  const [newestSeries, setNewestSeries] = useState([]);
  const [browseItems, setBrowseItems] = useState([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const browseItemsRef = useRef([]);
  const browseBufferRef = useRef([]);
  const browseNextPageRef = useRef(2);
  const browseTotalPagesRef = useRef(null);
  const browseLoadingRef = useRef(false);
  const browseHasMoreRef = useRef(true);
  const requestIdRef = useRef(0);
  const sentinelRef = useRef(null);

  const fetchBrowsePage = useCallback(
    (page) => {
      if (genre) {
        return api.getGenreTitles({
          slug: genreSlug,
          filter: "all",
          page,
          limit: 20,
        });
      }

      if (year) {
        return api.getYearTitles({
          year,
          filter: "all",
          page,
          limit: 20,
        });
      }

      return api.getTrending({
        filter,
        page,
        limit: 20,
      });
    },
    [filter, genre, genreSlug, year],
  );

  const loadMoreBrowse = useCallback(async () => {
    if (browseLoadingRef.current || !browseHasMoreRef.current) {
      return;
    }

    const loadRequestId = requestIdRef.current;
    const targetCount = columns * BROWSE_ROWS_PER_BATCH;
    const loadedKeys = new Set(
      browseItemsRef.current.map((item) => `${item.mediaType}:${item.id}`),
    );
    const nextItems = [];
    browseLoadingRef.current = true;
    setBrowseLoading(true);

    try {
      while (
        nextItems.length < targetCount &&
        browseHasMoreRef.current &&
        loadRequestId === requestIdRef.current
      ) {
        while (
          browseBufferRef.current.length &&
          nextItems.length < targetCount
        ) {
          const item = browseBufferRef.current.shift();
          const key = `${item.mediaType}:${item.id}`;

          if (!loadedKeys.has(key)) {
            loadedKeys.add(key);
            nextItems.push(item);
          }
        }

        if (nextItems.length >= targetCount || !browseHasMoreRef.current) {
          break;
        }

        if (
          !browseBufferRef.current.length &&
          browseTotalPagesRef.current &&
          browseNextPageRef.current > browseTotalPagesRef.current
        ) {
          browseHasMoreRef.current = false;
          break;
        }

        const feed = await fetchBrowsePage(browseNextPageRef.current);

        if (loadRequestId !== requestIdRef.current) {
          return;
        }

        const items = feedItems(feed);
        browseNextPageRef.current += 1;
        browseTotalPagesRef.current =
          feed?.totalPages || browseTotalPagesRef.current;

        if (!items.length) {
          browseHasMoreRef.current = false;
          break;
        }

        browseBufferRef.current.push(...items);

        if (
          feed?.totalPages &&
          browseNextPageRef.current > feed.totalPages &&
          !browseBufferRef.current.length
        ) {
          browseHasMoreRef.current = false;
        }
      }

      if (loadRequestId !== requestIdRef.current) {
        return;
      }

      browseItemsRef.current = [...browseItemsRef.current, ...nextItems];
      setBrowseItems(browseItemsRef.current);

      if (nextItems.length < targetCount && !browseBufferRef.current.length) {
        browseHasMoreRef.current = false;
      }
    } catch (error) {
      console.warn("RainFlix browse feed failed:", error);
      browseHasMoreRef.current = false;
    } finally {
      if (loadRequestId === requestIdRef.current) {
        browseLoadingRef.current = false;
        setBrowseLoading(false);
        setBrowseHasMore(browseHasMoreRef.current);
      }
    }
  }, [columns, fetchBrowsePage]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    let cancelled = false;

    browseItemsRef.current = [];
    browseBufferRef.current = [];
    browseNextPageRef.current = 2;
    browseTotalPagesRef.current = null;
    browseLoadingRef.current = false;
    browseHasMoreRef.current = true;
    setBrowseItems([]);
    setBrowseHasMore(true);
    setBrowseLoading(false);
    setCarouselItems([]);
    setTrending([]);
    setNewestMovies([]);
    setNewestSeries([]);
    setLoading(true);
    setLoadError(false);

    const loadFeeds = async () => {
      let carouselFeed;
      let trendingFeed;
      let movieFeed = { items: [] };
      let seriesFeed = { items: [] };

      if (genre) {
        [trendingFeed, movieFeed, seriesFeed] = await Promise.all([
          api.getGenreTitles({
            slug: genreSlug,
            filter: "all",
            page: 1,
            limit: api.PAGE_SIZE,
          }),
          genre.movieGenreIds.length
            ? api.getGenreTitles({
                slug: genreSlug,
                filter: "movie",
                page: 1,
                limit: api.PAGE_SIZE,
                sortBy: "newest",
              })
            : Promise.resolve({ items: [] }),
          genre.tvGenreIds.length
            ? api.getGenreTitles({
                slug: genreSlug,
                filter: "tv",
                page: 1,
                limit: api.PAGE_SIZE,
                sortBy: "newest",
              })
            : Promise.resolve({ items: [] }),
        ]);
        carouselFeed = trendingFeed;
      } else if (year) {
        [trendingFeed, movieFeed, seriesFeed] = await Promise.all([
          api.getYearTitles({
            year,
            filter: "all",
            page: 1,
            limit: api.PAGE_SIZE,
          }),
          api.getYearTitles({
            year,
            filter: "movie",
            page: 1,
            limit: api.PAGE_SIZE,
            sortBy: "newest",
          }),
          api.getYearTitles({
            year,
            filter: "tv",
            page: 1,
            limit: api.PAGE_SIZE,
            sortBy: "newest",
          }),
        ]);
        carouselFeed = trendingFeed;
      } else if (filter === "all") {
        [carouselFeed, trendingFeed, movieFeed, seriesFeed] = await Promise.all(
          [
            api.getTrendingMovies(api.PAGE_SIZE),
            api.getTrendingThisWeek(api.PAGE_SIZE),
            api.getNewestMovies(api.PAGE_SIZE),
            api.getNewestSeries(api.PAGE_SIZE),
          ],
        );
      } else if (filter === "movie") {
        [trendingFeed, movieFeed] = await Promise.all([
          api.getTrending({
            filter: "movie",
            page: 1,
            limit: api.PAGE_SIZE,
          }),
          api.getNewestMovies(api.PAGE_SIZE),
        ]);
        carouselFeed = trendingFeed;
      } else {
        [trendingFeed, seriesFeed] = await Promise.all([
          api.getTrending({
            filter: "tv",
            page: 1,
            limit: api.PAGE_SIZE,
          }),
          api.getNewestSeries(api.PAGE_SIZE),
        ]);
        carouselFeed = trendingFeed;
      }

      if (cancelled || requestId !== requestIdRef.current) {
        return;
      }

      const nextCarouselItems = feedItems(carouselFeed).slice(0, api.PAGE_SIZE);
      const nextTrending = feedItems(trendingFeed).slice(0, api.PAGE_SIZE);
      const nextMovies = feedItems(movieFeed).slice(0, api.PAGE_SIZE);
      const nextSeries = feedItems(seriesFeed).slice(0, api.PAGE_SIZE);
      const allItems = [
        ...nextCarouselItems,
        ...nextTrending,
        ...nextMovies,
        ...nextSeries,
      ];
      const posters = allItems.map((item) => item.poster || item.backdrop);

      setCarouselItems(nextCarouselItems);
      setTrending(nextTrending);
      setNewestMovies(nextMovies);
      setNewestSeries(nextSeries);
      setLoading(false);

      const logosPromise = api
        .getTitleLogos(nextCarouselItems)
        .then(async (items) => {
          await Promise.all(
            items
              .filter((item) => item.logo)
              .map((item) => preloadImage(item.logo)),
          );
          return items;
        })
        .catch(() => nextCarouselItems);
      const logoRace = Promise.race([
        logosPromise,
        delay(TITLE_LOGO_WAIT_MS).then(() => null),
      ]);
      const [preparedLogos] = await Promise.all([logoRace, loadMoreBrowse()]);

      if (cancelled || requestId !== requestIdRef.current) {
        return;
      }

      if (preparedLogos) {
        setCarouselItems(preparedLogos);
      } else {
        logosPromise
          .then((items) => {
            if (!cancelled && requestId === requestIdRef.current) {
              setCarouselItems(items);
            }
          })
          .catch(() => {});
      }

      onReady?.(posters);
    };

    loadFeeds().catch((error) => {
      if (cancelled || requestId !== requestIdRef.current) {
        return;
      }

      console.error("RainFlix catalog failed:", error);
      setLoadError(true);
      browseHasMoreRef.current = false;
      setBrowseHasMore(false);
      setLoading(false);
      onReady?.([]);
    });

    return () => {
      cancelled = true;
      requestIdRef.current += 1;
    };
  }, [
    filter,
    genre,
    genreSlug,
    loadMoreBrowse,
    onReady,
    routeKey,
    retryVersion,
    year,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (
      !sentinel ||
      !browseHasMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadMoreBrowse();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [browseHasMore, loadMoreBrowse]);

  const pageTitle = genre
    ? genre.name
    : year
      ? `${year} Movies & Series`
      : filter === "movie"
        ? "Movies"
        : filter === "tv"
          ? "Series"
          : "RainFlix";

  usePageMetadata({
    title: pageTitle,
    description: genre
      ? `Browse ${genre.name} movies and series on RainFlix.`
      : year
        ? `Browse movies and series released in ${year} on RainFlix.`
        : filter === "movie"
          ? "Discover trending and newly released movies on RainFlix."
          : filter === "tv"
            ? "Discover trending and newly released television series on RainFlix."
            : "Discover trending movies and series through RainFlix.",
    image: carouselItems[0]?.backdrop || carouselItems[0]?.poster || "",
  });

  const ghostCount = browseLoading ? columns * BROWSE_ROWS_PER_BATCH : 0;
  const heroItems = useMemo(
    () => carouselItems.slice(0, api.PAGE_SIZE),
    [carouselItems],
  );
  const continueWatching = useMemo(
    () =>
      recentlyViewed.slice(0, api.PAGE_SIZE).map((item) => ({
        ...item,
        resumeLabel:
          item.mediaType === "tv"
            ? `S${item.season}:E${item.episode}`
            : "Resume",
        resumePath: watchPath(item, item.season, item.episode),
      })),
    [recentlyViewed],
  );

  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12"
      aria-label={config.ariaLabel}
    >
      {loadError ? (
        <div
          className="mb-7 border border-blue-900/80 bg-blue-950/30 p-6"
          role="alert"
        >
          <h1 className="text-xl font-black text-slate-50">
            The catalog could not refresh
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            RainFlix will keep using any cached titles that are available.
          </p>
          <button
            className="mt-4 rounded-lg bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25"
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      ) : null}

      <HeroCarousel items={heroItems} onBackdrop={onBackdrop} />

      {mode === "home" && continueWatching.length ? (
        <section className="mt-10" aria-labelledby="continueWatchingTitle">
          <div className="mb-5 flex items-end justify-between gap-6">
            <h2
              id="continueWatchingTitle"
              className="text-3xl font-black text-slate-50"
            >
              Continue watching
            </h2>
          </div>
          <MediaGrid items={continueWatching} />
        </section>
      ) : null}

      <section
        className={
          mode === "home" && continueWatching.length ? "mt-12" : "mt-10"
        }
        aria-labelledby="trendingTitle"
      >
        <div className="mb-5 flex items-end justify-between gap-6">
          <h1 id="trendingTitle" className="text-3xl font-black text-slate-50">
            {config.trendingTitle}
          </h1>
        </div>
        <MediaGrid
          items={trending}
          loading={loading}
          emptyText="No trending titles found."
        />
      </section>

      {config.showMovies ? (
        <section className="mt-12" aria-labelledby="newestMoviesTitle">
          <div className="mb-5">
            <h2
              id="newestMoviesTitle"
              className="text-3xl font-black text-slate-50"
            >
              {config.newestMoviesTitle}
            </h2>
          </div>
          <MediaGrid
            items={newestMovies}
            loading={loading}
            emptyText="No movies found."
          />
        </section>
      ) : null}

      {config.showSeries ? (
        <section className="mt-12" aria-labelledby="newestSeriesTitle">
          <div className="mb-5">
            <h2
              id="newestSeriesTitle"
              className="text-3xl font-black text-slate-50"
            >
              {config.newestSeriesTitle}
            </h2>
          </div>
          <MediaGrid
            items={newestSeries}
            loading={loading}
            emptyText="No series found."
          />
        </section>
      ) : null}

      {mode === "home" ? <AddonCatalogRows /> : null}

      <section className="mt-12" aria-labelledby="browseTitle">
        <div className="mb-5">
          <h2 id="browseTitle" className="text-3xl font-black text-slate-50">
            {config.browseTitle}
          </h2>
        </div>
        <MediaGrid
          items={browseItems}
          browse
          ghostCount={ghostCount}
          emptyText="No browse titles found."
        />
        <div
          className={`h-12${browseHasMore ? "" : " hidden"}`}
          ref={sentinelRef}
          aria-hidden="true"
        />
      </section>
    </section>
  );
}
