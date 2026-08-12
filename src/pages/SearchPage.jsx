import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { MediaGrid } from "../components/MediaCard.jsx";
import { api } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";
import { usePageMetadata } from "../lib/metadata.js";

const SEARCH_LIMIT = 20;
const BROWSE_LIMIT = 12;

function feedItems(feed) {
  return Array.isArray(feed) ? feed : feed?.items || [];
}

function uniqueTitles(items) {
  const seen = new Set();

  return items.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;

    if (!item.id || seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function getBrowsePage({ filter, genre, page, year }) {
  if (genre) {
    return api.getGenreTitles({
      slug: genre.slug,
      filter,
      page,
      limit: BROWSE_LIMIT,
      year,
    });
  }

  if (year) {
    return api.getYearTitles({
      year,
      filter,
      page,
      limit: BROWSE_LIMIT,
    });
  }

  return api.getTrending({
    filter,
    page,
    limit: BROWSE_LIMIT,
  });
}

function numericSearchParam(searchParams, name) {
  const value = searchParams.get(name) || "";
  return /^\d+$/.test(value) ? value : "";
}

export default function SearchPage({ onBackdrop, onReady }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get("q") || "").trim();
  const personId = numericSearchParam(searchParams, "person");
  const companyId = personId ? "" : numericSearchParam(searchParams, "company");
  const relationshipType = personId ? "person" : companyId ? "company" : "";
  const relationshipId = personId || companyId;
  const type = ["movie", "tv"].includes(searchParams.get("type"))
    ? searchParams.get("type")
    : "all";
  const genreSlug = searchParams.get("genre") || "";
  const year = searchParams.get("year") || "";
  const genre = genreSlug ? api.getGenre(genreSlug) : null;
  const browseMode = !relationshipId && query.length === 0;
  const [inputValue, setInputValue] = useState(query);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState({
    error: false,
    loading: false,
    loadingMore: false,
    page: 1,
    results: [],
    totalPages: 1,
  });
  const requestId = useRef(0);
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () =>
      Array.from(
        { length: currentYear - 1949 },
        (_, index) => currentYear - index,
      ),
    [currentYear],
  );

  usePageMetadata({
    title: query
      ? `${relationshipType === "person" ? "Titles with" : relationshipType === "company" ? "Titles from" : "Search"}: ${query}`
      : "Browse",
    description: query
      ? relationshipType === "person"
        ? `Browse movies and television series featuring ${query}.`
        : relationshipType === "company"
          ? `Browse movies and television series produced by ${query}.`
          : `Search RainFlix for ${query}.`
      : "Browse RainFlix movies and television series by type, genre, and year.",
    image: state.results[0]?.backdrop || state.results[0]?.poster || "",
  });

  useEffect(() => setInputValue(query), [query]);

  useEffect(() => {
    const id = ++requestId.current;

    if (!relationshipId && query.length === 1) {
      setState({
        error: false,
        loading: false,
        loadingMore: false,
        page: 1,
        results: [],
        totalPages: 1,
      });
      onReady?.([]);
      return undefined;
    }

    let cancelled = false;
    setState({
      error: false,
      loading: true,
      loadingMore: false,
      page: 1,
      results: [],
      totalPages: 1,
    });

    const searchRequest = browseMode
      ? getBrowsePage({ filter: type, genre, page: 1, year })
      : personId
        ? api.getPersonTitles(personId)
        : companyId
          ? api.getCompanyTitles(companyId)
          : api.search(query, SEARCH_LIMIT);

    searchRequest
      .then((response) => {
        if (cancelled || id !== requestId.current) {
          return;
        }

        const results = browseMode ? feedItems(response) : response;
        setState({
          error: false,
          loading: false,
          loadingMore: false,
          page: browseMode ? response?.page || 1 : 1,
          results,
          totalPages: browseMode ? response?.totalPages || 1 : 1,
        });
        onReady?.(
          results
            .flatMap((item) => [item.poster, item.backdrop])
            .filter(Boolean),
        );
        const backdrop = results[0]?.backdrop || results[0]?.poster;
        if (backdrop) {
          onBackdrop?.(backdrop);
        }
      })
      .catch(() => {
        if (!cancelled && id === requestId.current) {
          setState({
            error: true,
            loading: false,
            loadingMore: false,
            page: 1,
            results: [],
            totalPages: 1,
          });
          onReady?.([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    browseMode,
    companyId,
    genre,
    onBackdrop,
    onReady,
    personId,
    query,
    relationshipId,
    retryVersion,
    type,
    year,
  ]);

  const filteredResults = useMemo(
    () =>
      state.results.filter((item) => {
        if (type !== "all" && item.mediaType !== type) {
          return false;
        }

        if (year && String(item.year) !== year) {
          return false;
        }

        if (genre) {
          const allowedIds =
            item.mediaType === "tv" ? genre.tvGenreIds : genre.movieGenreIds;

          if (
            !allowedIds.some((id) => (item.genreIds || []).includes(Number(id)))
          ) {
            return false;
          }
        }

        return true;
      }),
    [genre, state.results, type, year],
  );

  const updateFilter = (name, value) => {
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") {
      next.set(name, value);
    } else {
      next.delete(name);
    }
    setSearchParams(next);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const cleanValue = inputValue.trim();
    const next = new URLSearchParams(searchParams);

    if (cleanValue) {
      next.set("q", cleanValue);
      trackEvent("search-submit");
    } else {
      next.delete("q");
    }

    next.delete("person");
    next.delete("company");

    setSearchParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams();
    if (query) {
      next.set("q", query);
    }
    if (relationshipType && relationshipId) {
      next.set(relationshipType, relationshipId);
    }
    setSearchParams(next);
  };

  const loadMore = async () => {
    if (
      !browseMode ||
      state.loading ||
      state.loadingMore ||
      state.page >= state.totalPages
    ) {
      return;
    }

    const id = requestId.current;
    const nextPage = state.page + 1;
    setState((current) => ({ ...current, loadingMore: true }));

    try {
      const feed = await getBrowsePage({
        filter: type,
        genre,
        page: nextPage,
        year,
      });

      if (id !== requestId.current) {
        return;
      }

      setState((current) => ({
        ...current,
        loadingMore: false,
        page: feed?.page || nextPage,
        results: uniqueTitles([...current.results, ...feedItems(feed)]),
        totalPages: feed?.totalPages || current.totalPages,
      }));
    } catch (error) {
      console.warn("RainFlix could not load more browse results:", error);
      if (id === requestId.current) {
        setState((current) => ({ ...current, loadingMore: false }));
      }
    }
  };

  const browseMediaLabel =
    type === "movie"
      ? "movies"
      : type === "tv"
        ? "series"
        : "movies and series";
  const browseTitle = `Browse ${[year, genre?.name, browseMediaLabel]
    .filter(Boolean)
    .join(" ")}`;

  const statusText = state.loading
    ? browseMode
      ? "Loading browse results"
      : relationshipType
        ? `Loading titles related to ${query}`
        : `Searching for ${query}`
    : !relationshipId && query.length === 1
      ? "Enter at least two characters to search."
      : `${filteredResults.length} result${
          filteredResults.length === 1 ? "" : "s"
        } shown.`;

  return (
    <section
      className="mx-auto min-w-0 w-full max-w-[1440px] px-4 py-8 sm:px-6 md:px-10 lg:px-12"
      aria-labelledby="searchPageTitle"
    >
      <header className="mx-auto w-full max-w-5xl border-b border-blue-950/80 pb-7 text-center">
        <p className="text-xs font-black uppercase text-sky-300">
          {relationshipType === "person"
            ? "Filmography"
            : relationshipType === "company"
              ? "Production catalog"
              : browseMode
                ? "Browse the catalog"
                : "Find your next title"}
        </p>
        <h1
          id="searchPageTitle"
          className="mt-2 text-3xl font-black text-slate-50 md:text-4xl"
        >
          Search RainFlix
        </h1>
      </header>

      <form
        className="mt-7 min-w-0 border-b border-blue-950/80 pb-7"
        onSubmit={submitSearch}
        role="search"
      >
        <div className="mx-auto grid w-full min-w-0 max-w-5xl gap-4">
          <label
            className="flex min-h-14 w-full min-w-0 items-center gap-3 border border-blue-900/80 bg-slate-950/80 px-3 transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-400/10 sm:px-4"
            htmlFor="catalogSearch"
          >
            <Search
              className="h-5 w-5 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <input
              id="catalogSearch"
              className="min-w-0 flex-1 bg-transparent text-base text-slate-100 outline-none placeholder:text-slate-500"
              type="search"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder="Search titles, people, or studios"
              aria-label="Search titles, people, or studios"
              autoComplete="off"
            />
            <button
              className="shrink-0 rounded-lg bg-sky-400 px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25 sm:px-4"
              type="submit"
            >
              Search
            </button>
          </label>

          <div className="mx-auto grid w-full min-w-0 max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="grid min-w-0 gap-2 text-xs font-black uppercase text-slate-400">
              Type
              <select
                className="block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
                value={type}
                onChange={(event) => updateFilter("type", event.target.value)}
              >
                <option value="all">Movies and series</option>
                <option value="movie">Movies</option>
                <option value="tv">Series</option>
              </select>
            </label>

            <label className="grid min-w-0 gap-2 text-xs font-black uppercase text-slate-400">
              Genre
              <select
                className="block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
                value={genre?.slug || ""}
                onChange={(event) => updateFilter("genre", event.target.value)}
              >
                <option value="">All genres</option>
                {api.GENRES.map((item) => (
                  <option value={item.slug} key={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-2 text-xs font-black uppercase text-slate-400">
              Year
              <select
                className="block min-h-11 w-full min-w-0 max-w-full rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
                value={year}
                onChange={(event) => updateFilter("year", event.target.value)}
              >
                <option value="">All years</option>
                {years.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {type !== "all" || genreSlug || year ? (
            <button
              className="inline-flex min-h-11 justify-self-center items-center justify-center gap-2 rounded-lg border border-blue-900/80 px-4 text-sm font-black text-slate-300 transition hover:border-sky-400 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
              type="button"
              onClick={clearFilters}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Clear filters
            </button>
          ) : null}
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {statusText}
      </p>

      <section className="mt-8" aria-labelledby="searchResultsTitle">
        <div className="mb-5 flex min-w-0 flex-wrap items-end justify-between gap-4">
          <h2
            id="searchResultsTitle"
            className="min-w-0 break-words text-2xl font-black text-slate-50 md:text-3xl"
          >
            {query
              ? relationshipType === "person"
                ? `Movies and series with ${query}`
                : relationshipType === "company"
                  ? `Movies and series from ${query}`
                  : `Results for "${query}"`
              : browseTitle}
          </h2>
          {!state.loading &&
          (browseMode || relationshipId || query.length >= 2) ? (
            <span className="shrink-0 text-sm font-bold text-slate-500">
              {filteredResults.length}
            </span>
          ) : null}
        </div>

        {state.error ? (
          <div className="border border-blue-900/80 bg-blue-950/25 p-7">
            <p className="text-slate-300">
              RainFlix could not complete this search.
            </p>
            <button
              className="mt-4 rounded-lg bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-sky-300"
              type="button"
              onClick={() => setRetryVersion((value) => value + 1)}
            >
              Try again
            </button>
          </div>
        ) : (
          <MediaGrid
            items={filteredResults}
            loading={state.loading}
            browse
            ghostCount={state.loadingMore ? BROWSE_LIMIT : 0}
            emptyText={
              !relationshipId && query.length === 1
                ? "Enter at least two characters to search."
                : relationshipType
                  ? "No related titles match these filters."
                  : "No titles match these filters."
            }
          />
        )}

        {browseMode &&
        !state.error &&
        !state.loading &&
        filteredResults.length > 0 &&
        state.page < state.totalPages ? (
          <div className="mt-8 flex justify-center">
            <button
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-500/70 bg-slate-950/80 px-5 text-sm font-black text-sky-200 transition hover:border-sky-300 hover:bg-sky-400/10 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20 disabled:cursor-wait disabled:opacity-70"
              type="button"
              onClick={loadMore}
              disabled={state.loadingMore}
            >
              {state.loadingMore ? (
                <LoaderCircle
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {state.loadingMore ? "Loading more" : "Load more"}
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}
