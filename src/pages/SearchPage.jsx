import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useSearchParams } from "react-router";
import { MediaGrid } from "../components/MediaCard.jsx";
import { api } from "../lib/api.js";
import { trackEvent } from "../lib/analytics.js";
import { usePageMetadata } from "../lib/metadata.js";

const SEARCH_LIMIT = 20;

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
  const [inputValue, setInputValue] = useState(query);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState({
    error: false,
    loading: false,
    results: [],
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
      : "Search",
    description: query
      ? relationshipType === "person"
        ? `Browse movies and television series featuring ${query}.`
        : relationshipType === "company"
          ? `Browse movies and television series produced by ${query}.`
          : `Search RainFlix for ${query}.`
      : "Search RainFlix movies, television series, people, and production companies.",
    image: state.results[0]?.backdrop || state.results[0]?.poster || "",
  });

  useEffect(() => setInputValue(query), [query]);

  useEffect(() => {
    const id = ++requestId.current;

    if (!relationshipId && query.length < 2) {
      setState({ error: false, loading: false, results: [] });
      onReady?.([]);
      return undefined;
    }

    let cancelled = false;
    setState((current) => ({ ...current, error: false, loading: true }));

    const searchRequest = personId
      ? api.getPersonTitles(personId)
      : companyId
        ? api.getCompanyTitles(companyId)
        : api.search(query, SEARCH_LIMIT);

    searchRequest
      .then((results) => {
        if (cancelled || id !== requestId.current) {
          return;
        }

        setState({ error: false, loading: false, results });
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
          setState({ error: true, loading: false, results: [] });
          onReady?.([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    onBackdrop,
    onReady,
    personId,
    query,
    relationshipId,
    retryVersion,
  ]);

  const genre = genreSlug ? api.getGenre(genreSlug) : null;
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

  const statusText = state.loading
    ? relationshipType
      ? `Loading titles related to ${query}`
      : `Searching for ${query}`
    : !relationshipId && query.length < 2
      ? "Enter at least two characters to search."
      : `${filteredResults.length} result${
          filteredResults.length === 1 ? "" : "s"
        } shown.`;

  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12"
      aria-labelledby="searchPageTitle"
    >
      <header className="border-b border-blue-950/80 pb-7">
        <p className="text-xs font-black uppercase text-sky-300">
          {relationshipType === "person"
            ? "Filmography"
            : relationshipType === "company"
              ? "Production catalog"
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
        className="mt-7 grid gap-4 border-b border-blue-950/80 pb-7"
        onSubmit={submitSearch}
        role="search"
      >
        <label
          className="flex min-h-14 items-center gap-3 border border-blue-900/80 bg-slate-950/80 px-4 transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-400/10"
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
            className="rounded-lg bg-sky-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25"
            type="submit"
          >
            Search
          </button>
        </label>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
          <label className="grid gap-2 text-xs font-black uppercase text-slate-400">
            Type
            <select
              className="min-h-11 rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
              value={type}
              onChange={(event) => updateFilter("type", event.target.value)}
            >
              <option value="all">Movies and series</option>
              <option value="movie">Movies</option>
              <option value="tv">Series</option>
            </select>
          </label>

          <label className="grid gap-2 text-xs font-black uppercase text-slate-400">
            Genre
            <select
              className="min-h-11 rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
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

          <label className="grid gap-2 text-xs font-black uppercase text-slate-400">
            Year
            <select
              className="min-h-11 rounded-lg border border-blue-900/80 bg-slate-950 px-3 text-sm font-bold normal-case text-slate-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-400/10"
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

          {type !== "all" || genre || year ? (
            <button
              className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-blue-900/80 px-4 text-sm font-black text-slate-300 transition hover:border-sky-400 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
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
        <div className="mb-5 flex items-end justify-between gap-4">
          <h2
            id="searchResultsTitle"
            className="text-2xl font-black text-slate-50 md:text-3xl"
          >
            {query
              ? relationshipType === "person"
                ? `Movies and series with ${query}`
                : relationshipType === "company"
                  ? `Movies and series from ${query}`
                  : `Results for "${query}"`
              : "Results"}
          </h2>
          {!state.loading && (relationshipId || query.length >= 2) ? (
            <span className="text-sm font-bold text-slate-500">
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
            emptyText={
              !relationshipId && query.length < 2
                ? "Enter at least two characters to search."
                : relationshipType
                  ? "No related titles match these filters."
                  : "No titles match these filters."
            }
          />
        )}
      </section>
    </section>
  );
}
