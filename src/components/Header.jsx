import { useEffect, useRef, useState } from "react";
import { ArrowRight, Menu, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router";
import rainflixWordmark from "../../assets/rainflix-wordmark.png";
import { api, imageFallback } from "../lib/api.js";
import { posterImageProps } from "../lib/images.js";
import { useDetails } from "./details/DetailsProvider.jsx";
import { isNativeApp } from "../platform/index.js";

const showAddonsNavigation = isNativeApp;

function routeState(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const routeName = parts[0] || "home";
  let primary = routeName;

  if (routeName === "watch" || routeName === "title") {
    primary = "browse";
  }

  return {
    genre: routeName === "genre" ? decodeURIComponent(parts[1] || "") : "",
    primary,
    routeName,
    year: routeName === "year" ? parts[1] || "" : "",
  };
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
        {...posterImageProps(image, "44px")}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.removeAttribute("srcset");
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
  const navigate = useNavigate();
  const { openDetails } = useDetails();
  const state = routeState(location.pathname);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState({
    loading: false,
    results: [],
    searched: false,
  });
  const searchRootRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileCloseRef = useRef(null);
  const mobileDrawerRef = useRef(null);
  const mobilePreviousFocusRef = useRef(null);
  const mobileToggleRef = useRef(null);
  const requestId = useRef(0);
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
    setSearchOpen(false);
  }, [location.pathname, state.routeName]);

  useEffect(() => {
    document.body.classList.toggle("overflow-hidden", mobileOpen);
    return () => document.body.classList.remove("overflow-hidden");
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return undefined;
    }

    const shell = document.querySelector("#app-shell");
    mobilePreviousFocusRef.current = document.activeElement;
    mobileCloseRef.current?.focus();
    shell?.setAttribute("aria-hidden", "true");
    if (shell) {
      shell.inert = true;
    }

    return () => {
      if (shell) {
        shell.inert = false;
        shell.removeAttribute("aria-hidden");
      }

      const previousFocus = mobilePreviousFocusRef.current;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
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
    setSearchState((current) => ({
      ...current,
      loading: true,
      searched: true,
    }));
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
    };
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") {
        return;
      }

      if (searchOpen) {
        setSearchOpen(false);
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
  }, [mobileOpen, searchOpen]);

  const selectSearchResult = (item) => {
    setQuery("");
    setSearchOpen(false);
    openDetails(item.mediaType, item.id);
  };
  const openSearchPage = () => {
    const cleanQuery = query.trim();

    if (cleanQuery.length < 2) {
      searchInputRef.current?.focus();
      return;
    }

    setSearchOpen(false);
    navigate(
      cleanQuery ? `/search?q=${encodeURIComponent(cleanQuery)}` : "/search",
    );
  };
  const primaryClass = (name) =>
    `header-nav-link${state.primary === name ? " is-active" : ""}`;
  const mobilePrimaryClass = (name) =>
    `mobile-nav-link${state.primary === name ? " is-active" : ""}`;
  const trapMobileFocus = (event) => {
    if (event.key !== "Tab" || !mobileDrawerRef.current) {
      return;
    }

    const focusable = [
      ...mobileDrawerRef.current.querySelectorAll(
        'a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((element) => !element.closest("[inert]"));
    const first = focusable[0];
    const last = focusable.at(-1);

    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const mobileLayer = (
    <div
      id="mobileNavLayer"
      className={`mobile-nav-layer lg:hidden${mobileOpen ? " is-open" : ""}`}
      aria-hidden={!mobileOpen}
      inert={!mobileOpen}
      onKeyDown={trapMobileFocus}
    >
      <button
        className="mobile-nav-backdrop fixed inset-0 z-[300] cursor-default bg-black/80"
        type="button"
        onClick={() => setMobileOpen(false)}
        aria-label="Close navigation"
        tabIndex="-1"
      />
      <aside
        className="mobile-nav-drawer fixed inset-y-0 right-0 z-[310] w-[min(18rem,82vw)] overflow-y-auto border-l border-blue-900/70 bg-slate-950 p-5 shadow-2xl shadow-black/60"
        aria-label="Mobile navigation"
        aria-modal="true"
        role="dialog"
        ref={mobileDrawerRef}
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
            ref={mobileCloseRef}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>

        <nav className="mt-5 grid gap-1" aria-label="Mobile primary navigation">
          <Link className={mobilePrimaryClass("home")} to="/home">
            Home
          </Link>
          <Link className={mobilePrimaryClass("browse")} to="/browse">
            Browse
          </Link>
          {!isNativeApp && (
            <Link
              className={mobilePrimaryClass("downloads")}
              to="/downloads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Downloads
            </Link>
          )}

          <Link className={mobilePrimaryClass("library")} to="/library">
            My List
          </Link>
          {isNativeApp && (
            <Link className={mobilePrimaryClass("settings")} to="/settings">
              Settings
            </Link>
          )}
          {showAddonsNavigation && (
            <Link className={mobilePrimaryClass("addons")} to="/addons">
              Add-ons
            </Link>
          )}
        </nav>
      </aside>
    </div>
  );

  return (
    <>
      <header className="relative bg-transparent">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-[1536px] items-center gap-1 px-3 sm:gap-2 sm:px-4 lg:gap-6 lg:px-12">
          <Link
            className="inline-flex min-w-0 shrink-0 items-center text-slate-50 no-underline"
            to="/home"
            aria-label="RainFlix home"
          >
            <img
              className="h-7 w-auto max-w-[70px] object-contain sm:max-w-none md:h-8"
              src={rainflixWordmark}
              alt="RainFlix"
              draggable="false"
            />
          </Link>

          <nav
            className="relative hidden h-full items-center gap-5 lg:flex"
            aria-label="Primary navigation"
          >
            <Link className={primaryClass("home")} to="/home">
              Home
            </Link>
            <Link className={primaryClass("browse")} to="/browse">
              Browse
            </Link>
            {!isNativeApp && (
              <Link
                className={primaryClass("downloads")}
                to="/downloads"
                target="_blank"
                rel="noopener noreferrer"
              >
                Downloads
              </Link>
            )}
            <Link className={primaryClass("library")} to="/library">
              My List
            </Link>
            {isNativeApp && (
              <Link className={primaryClass("settings")} to="/settings">
                Settings
              </Link>
            )}
            {showAddonsNavigation && (
              <Link className={primaryClass("addons")} to="/addons">
                Add-ons
              </Link>
            )}
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
              inert={!searchOpen}
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
                  placeholder="Search titles, people, or studios"
                  autoComplete="off"
                  value={query}
                  ref={searchInputRef}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSearchOpen(false);
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      openSearchPage();
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
                    const currentIndex = results.indexOf(
                      document.activeElement,
                    );
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
                        No related titles found.
                      </div>
                    ) : null}
                    {!searchState.loading && searchState.searched ? (
                      <button
                        className="flex w-full items-center justify-between border-t border-blue-900/70 px-4 py-3 text-left text-sm font-black text-sky-300 transition hover:bg-sky-400/10 hover:text-sky-200 focus-visible:bg-sky-400/10 focus-visible:outline-none"
                        type="button"
                        onClick={openSearchPage}
                      >
                        View all search results
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <button
            id="mobileNavToggle"
            className="header-icon-button lg:hidden"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-controls="mobileNavLayer"
            aria-expanded={mobileOpen}
            title="Menu"
            ref={mobileToggleRef}
          >
            <Menu className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
      </header>
      {createPortal(mobileLayer, document.body)}
    </>
  );
}
