import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router";
import rainflixWordmark from "../../assets/rainflix-wordmark.png";
import { api, imageFallback } from "../lib/api.js";
import { useDetails } from "./details/DetailsProvider.jsx";

function routeState(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const routeName = parts[0] || "home";
  let primary = routeName;

  if (routeName === "watch") {
    primary = api.normalizeMediaType(parts[1]) === "tv" ? "series" : "movies";
  }

  return {
    genre: routeName === "genre" ? decodeURIComponent(parts[1] || "") : "",
    primary,
    routeName,
    year: routeName === "year" ? parts[1] || "" : "",
  };
}

function FilterMenu({
  activeValue,
  children,
  columns,
  label,
  onClose,
  onOpen,
  open,
}) {
  return (
    <div
      className={`header-menu flex h-full items-center${open ? " is-open" : ""}`}
      onPointerEnter={onOpen}
      onPointerLeave={(event) => {
        if (!event.currentTarget.contains(document.activeElement)) {
          onClose();
        }
      }}
      onFocus={onOpen}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onClose();
        }
      }}
    >
      <button
        className={`header-nav-link h-full${activeValue ? " is-active" : ""}`}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? onClose() : onOpen())}
      >
        {label}
      </button>
      <div
        className="header-dropdown absolute left-0 top-full z-[220] w-[min(34rem,calc(100vw-3rem))] pt-2"
        aria-hidden={!open}
      >
        <div
          className={`grid max-h-[28rem] ${columns} gap-x-4 gap-y-1 overflow-y-auto border border-blue-900/80 bg-slate-950/95 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl`}
          role="menu"
          aria-label={`Browse by ${label.toLowerCase()}`}
          onClick={onClose}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function SearchResult({ item, onSelect }) {
  const image = item.poster || item.backdrop || imageFallback(item.title);

  return (
    <button
      className="flex min-h-[5.5rem] w-full gap-3 border-b border-blue-950/70 p-3 text-left transition-colors duration-200 last:border-b-0 hover:bg-sky-400/10 focus-visible:bg-sky-400/10 focus-visible:outline-none"
      type="button"
      data-search-result
      role="option"
      onClick={() => onSelect(item)}
      aria-label={`More information about ${item.title}`}
    >
      <img
        className="h-16 w-11 shrink-0 object-cover"
        src={image}
        alt=""
        loading="lazy"
        draggable="false"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = imageFallback(item.title);
        }}
      />
      <span className="min-w-0 pt-1">
        <span className="block truncate text-sm font-bold text-slate-100">
          {item.title}
        </span>
        <span className="mt-1 block text-xs text-slate-400">
          {api.mediaLabel(item.mediaType)} &middot; {item.year} &middot;{" "}
          {item.rating}
        </span>
      </span>
    </button>
  );
}

function SearchSkeleton() {
  return (
    <div className="flex gap-3 border-b border-blue-950/70 p-3 last:border-b-0">
      <div className="h-16 w-11 shrink-0 animate-pulse bg-blue-950/70" />
      <div className="min-w-0 flex-1 pt-1">
        <div className="h-4 w-3/4 animate-pulse bg-blue-950/70" />
        <div className="mt-3 h-3 w-1/2 animate-pulse bg-blue-950/50" />
      </div>
    </div>
  );
}

export default function Header() {
  const location = useLocation();
  const { openDetails } = useDetails();
  const state = routeState(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(
    state.routeName === "genre"
      ? "genre"
      : state.routeName === "year"
        ? "year"
        : "",
  );
  const [desktopMenu, setDesktopMenu] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({
    loading: false,
    results: [],
    searched: false,
  });
  const searchRootRef = useRef(null);
  const searchInputRef = useRef(null);
  const requestId = useRef(0);
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: currentYear - 1949 }, (_, index) => currentYear - index),
    [currentYear],
  );

  useEffect(() => {
    const shell = document.querySelector("#site-header");
    const updateSurface = () =>
      shell?.classList.toggle("is-scrolled", window.scrollY > 24);

    updateSurface();
    window.addEventListener("scroll", updateSurface, { passive: true });
    return () => window.removeEventListener("scroll", updateSurface);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setDesktopMenu("");
    setSearchOpen(false);
    setMobileFilter(
      state.routeName === "genre"
        ? "genre"
        : state.routeName === "year"
          ? "year"
          : "",
    );
  }, [location.pathname, state.routeName]);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  useEffect(() => {
    if (searchOpen) {
      window.setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      requestId.current += 1;
      setSearchState({ loading: false, results: [], searched: false });
    }
  }, [searchOpen]);

  useEffect(() => {
    const cleanQuery = query.trim();

    if (!searchOpen || cleanQuery.length < 2) {
      setSearchState({ loading: false, results: [], searched: false });
      return undefined;
    }

    const id = ++requestId.current;
    setSearchState((current) => ({ ...current, loading: true, searched: true }));
    const timer = window.setTimeout(async () => {
      try {
        const results = await api.search(cleanQuery);

        if (id === requestId.current) {
          setSearchState({ loading: false, results, searched: true });
        }
      } catch {
        if (id === requestId.current) {
          setSearchState({ loading: false, results: [], searched: true });
        }
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, searchOpen]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (
        searchOpen &&
        searchRootRef.current &&
        !searchRootRef.current.contains(event.target)
      ) {
        setSearchOpen(false);
      }

      if (!event.target.closest(".header-menu")) {
        setDesktopMenu("");
      }
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (searchOpen) {
        setSearchOpen(false);
      } else if (desktopMenu) {
        setDesktopMenu("");
      } else if (mobileOpen) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopMenu, mobileOpen, searchOpen]);

  const selectSearchResult = (item) => {
    setQuery("");
    setSearchOpen(false);
    openDetails(item.mediaType, item.id);
  };
  const primaryClass = (name) =>
    `header-nav-link${state.primary === name ? " is-active" : ""}`;
  const mobilePrimaryClass = (name) =>
    `mobile-nav-link${state.primary === name ? " is-active" : ""}`;
  const filterLinkClass = (active) =>
    `filter-menu-link${active ? " is-active" : ""}`;

  const mobileLayer = (
    <div
      id="mobileNavLayer"
      className={`mobile-nav-layer md:hidden${mobileOpen ? " is-open" : ""}`}
      aria-hidden={!mobileOpen}
    >
      <button
        className="mobile-nav-backdrop fixed inset-0 z-[300] cursor-default bg-black/80"
        type="button"
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex={mobileOpen ? 0 : -1}
      />
      <aside
        className="mobile-nav-drawer fixed inset-y-0 left-0 z-[310] w-[min(18rem,82vw)] overflow-y-auto border-r border-blue-900/70 bg-slate-950 p-5 shadow-2xl shadow-black/60"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-between border-b border-blue-950/80 pb-5">
          <Link
            className="inline-flex items-center text-slate-50"
            to="/home"
            aria-label="RainFlix home"
          >
            <img
              className="h-8 w-auto object-contain"
              src={rainflixWordmark}
              alt="RainFlix"
              draggable="false"
            />
          </Link>
          <button
            id="mobileNavClose"
            className="header-icon-button"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            title="Close"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-5 grid gap-1" aria-label="Mobile primary navigation">
          <Link className={mobilePrimaryClass("home")} to="/home">
            Home
          </Link>
          <Link className={mobilePrimaryClass("movies")} to="/movies">
            Movies
          </Link>
          <Link className={mobilePrimaryClass("series")} to="/series">
            Series
          </Link>

          <div className="border-t border-blue-950/80 pt-1">
            <button
              className={`mobile-nav-link w-full text-left${
                state.genre ? " is-active" : ""
              }`}
              type="button"
              onClick={() =>
                setMobileFilter((current) =>
                  current === "genre" ? "" : "genre",
                )
              }
              aria-controls="mobileGenreList"
              aria-expanded={mobileFilter === "genre"}
            >
              Genres
            </button>
            <div
              id="mobileGenreList"
              className={`mobile-filter-list grid grid-cols-2 gap-x-3${
                mobileFilter === "genre" ? " is-open" : ""
              }`}
              aria-hidden={mobileFilter !== "genre"}
            >
              {api.GENRES.map((genre) => (
                <Link
                  className={filterLinkClass(state.genre === genre.slug)}
                  to={`/genre/${encodeURIComponent(genre.slug)}`}
                  key={genre.slug}
                >
                  {genre.name}
                </Link>
              ))}
            </div>
          </div>

          <div className="border-t border-blue-950/80 pt-1">
            <button
              className={`mobile-nav-link w-full text-left${
                state.year ? " is-active" : ""
              }`}
              type="button"
              onClick={() =>
                setMobileFilter((current) =>
                  current === "year" ? "" : "year",
                )
              }
              aria-controls="mobileYearList"
              aria-expanded={mobileFilter === "year"}
            >
              Year
            </button>
            <div
              id="mobileYearList"
              className={`mobile-filter-list grid grid-cols-3 gap-x-3${
                mobileFilter === "year" ? " is-open" : ""
              }`}
              aria-hidden={mobileFilter !== "year"}
            >
              {years.map((year) => (
                <Link
                  className={`${filterLinkClass(
                    state.year === String(year),
                  )} text-center`}
                  to={`/year/${year}`}
                  key={year}
                >
                  {year}
                </Link>
              ))}
            </div>
          </div>
        </nav>
      </aside>
    </div>
  );

  return (
    <>
      <header className="relative bg-transparent">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-[1536px] items-center gap-2 px-4 md:gap-6 md:px-10 lg:px-12">
          <Link
            className="inline-flex min-w-max items-center text-slate-50 no-underline"
            to="/home"
            aria-label="RainFlix home"
          >
            <img
              className="h-7 w-auto object-contain md:h-8"
              src={rainflixWordmark}
              alt="RainFlix"
              draggable="false"
            />
          </Link>

          <nav
            className="relative hidden h-full items-center gap-5 md:flex"
            aria-label="Primary navigation"
          >
            <Link className={primaryClass("home")} to="/home">
              Home
            </Link>
            <Link className={primaryClass("movies")} to="/movies">
              Movies
            </Link>
            <Link className={primaryClass("series")} to="/series">
              Series
            </Link>

            <FilterMenu
              label="Genres"
              activeValue={state.genre}
              open={desktopMenu === "genre"}
              onOpen={() => setDesktopMenu("genre")}
              onClose={() => setDesktopMenu("")}
              columns="grid-cols-3"
            >
              {api.GENRES.map((genre) => (
                <Link
                  className={filterLinkClass(state.genre === genre.slug)}
                  to={`/genre/${encodeURIComponent(genre.slug)}`}
                  role="menuitem"
                  key={genre.slug}
                >
                  {genre.name}
                </Link>
              ))}
            </FilterMenu>

            <FilterMenu
              label="Year"
              activeValue={state.year}
              open={desktopMenu === "year"}
              onOpen={() => setDesktopMenu("year")}
              onClose={() => setDesktopMenu("")}
              columns="grid-cols-5"
            >
              {years.map((year) => (
                <Link
                  className={`${filterLinkClass(
                    state.year === String(year),
                  )} text-center`}
                  to={`/year/${year}`}
                  role="menuitem"
                  key={year}
                >
                  {year}
                </Link>
              ))}
            </FilterMenu>
          </nav>

          <div
            id="headerSearch"
            className={`header-search relative ml-auto shrink-0${
              searchOpen ? " is-open" : ""
            }`}
            ref={searchRootRef}
          >
            <button
              id="searchToggle"
              className="header-icon-button"
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label="Search titles"
              aria-controls="searchPanel"
              aria-expanded={searchOpen}
              title="Search"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>

            <div
              id="searchPanel"
              className="header-search-panel absolute z-[230]"
              aria-hidden={!searchOpen}
            >
              <label
                className="flex h-12 w-full items-center gap-3 border border-blue-900/80 bg-slate-950 px-4 text-slate-400 shadow-2xl shadow-black/40 backdrop-blur-xl transition focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-400/10"
                htmlFor="globalSearch"
              >
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <input
                  id="globalSearch"
                  className="w-full min-w-0 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
                  type="search"
                  placeholder="Search movies and series"
                  autoComplete="off"
                  value={query}
                  ref={searchInputRef}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearchOpen(false);
                    } else if (event.key === "ArrowDown") {
                      const firstResult = document.querySelector(
                        "#searchDropdown [data-search-result]",
                      );
                      if (firstResult) {
                        event.preventDefault();
                        firstResult.focus();
                      }
                    }
                  }}
                  aria-autocomplete="list"
                  aria-controls="searchDropdown"
                  aria-expanded={
                    searchOpen &&
                    query.trim().length >= 2 &&
                    (searchState.loading || searchState.searched)
                  }
                />
                <button
                  id="searchClose"
                  className="shrink-0 text-slate-400 transition hover:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  title="Close search"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </label>

              {query.trim().length >= 2 ? (
                <div
                  id="searchDropdown"
                  className="absolute right-0 top-full mt-2 w-full overflow-hidden border border-blue-900/80 bg-slate-950/95 shadow-2xl shadow-black/45 backdrop-blur-xl"
                  role="listbox"
                  aria-label="Search results"
                  onKeyDown={(event) => {
                    if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
                      return;
                    }

                    const results = [
                      ...document.querySelectorAll(
                        "#searchDropdown [data-search-result]",
                      ),
                    ];
                    const currentIndex = results.indexOf(document.activeElement);
                    event.preventDefault();

                    if (event.key === "ArrowUp" && currentIndex <= 0) {
                      searchInputRef.current?.focus();
                      return;
                    }

                    const direction = event.key === "ArrowDown" ? 1 : -1;
                    const nextIndex = Math.min(
                      results.length - 1,
                      Math.max(0, currentIndex + direction),
                    );
                    results[nextIndex]?.focus();
                  }}
                >
                  <div className="max-h-[22rem] overflow-y-auto">
                    {searchState.loading
                      ? Array.from({ length: 3 }, (_, index) => (
                          <SearchSkeleton key={index} />
                        ))
                      : searchState.results.map((item) => (
                          <SearchResult
                            item={item}
                            onSelect={selectSearchResult}
                            key={`${item.mediaType}:${item.id}`}
                          />
                        ))}
                    {!searchState.loading &&
                    searchState.searched &&
                    !searchState.results.length ? (
                      <div className="px-4 py-3 text-sm text-slate-400">
                        No titles found.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <button
            id="mobileNavToggle"
            className="header-icon-button md:hidden"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-controls="mobileNavLayer"
            aria-expanded={mobileOpen}
            title="Menu"
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>
      {createPortal(mobileLayer, document.body)}
    </>
  );
}
