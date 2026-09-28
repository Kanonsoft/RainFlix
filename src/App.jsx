import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import AppLoader from "./components/AppLoader.jsx";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import { DetailsProvider } from "./components/details/DetailsProvider.jsx";
import { LibraryProvider } from "./components/library/LibraryProvider.jsx";
import useRemoteNavigation from "./hooks/useRemoteNavigation.js";
import { api, config } from "./lib/api.js";
import CatalogPage from "./pages/CatalogPage.jsx";

const LibraryPage = lazy(() => import("./pages/LibraryPage.jsx"));
const AddonsPage = lazy(() => import("./pages/AddonsPage.jsx"));
const AddonCatalogPage = lazy(() => import("./pages/AddonCatalogPage.jsx"));
const AddonTitlePage = lazy(() => import("./pages/AddonTitlePage.jsx"));
const SearchPage = lazy(() => import("./pages/SearchPage.jsx"));
const WatchPage = lazy(() => import("./pages/WatchPage.jsx"));
const TitlePage = lazy(() => import("./pages/TitlePage.jsx"));
const PrivacyAnalytics = lazy(() =>
  import("./components/PrivacyAnalytics.jsx").catch(() => ({
    default: () => null,
  })),
);

const LEGACY_LOADER_POSTER_CACHE_KEY = "rainflix:loader-posters:v1";
const BACKDROP_FADE_DURATION = 960;

function routeIdentity(pathname) {
  const parts = pathname.split("/").filter(Boolean);

  return {
    id: parts[0] === "watch" ? parts[2] || "" : "",
    mediaType: parts[0] === "watch" ? parts[1] || "" : "",
    routeName: parts[0] || "home",
  };
}

function ScrollManager() {
  const location = useLocation();
  const previousRoute = useRef(null);

  useEffect(() => {
    const nextRoute = routeIdentity(location.pathname);
    const previous = previousRoute.current;
    const sameWatchTitle =
      previous?.routeName === "watch" &&
      nextRoute.routeName === "watch" &&
      previous.mediaType === nextRoute.mediaType &&
      previous.id === nextRoute.id;

    if (!sameWatchTitle) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    previousRoute.current = nextRoute;
    window.setTimeout(
      () => document.querySelector("#app-view")?.focus({ preventScroll: true }),
      0,
    );
  }, [location.pathname]);

  return null;
}

function RouteFallback() {
  return (
    <div
      className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading view</span>
      <div className="h-[24rem] animate-pulse border border-blue-900/70 bg-blue-950/25 md:h-[28rem]" />
    </div>
  );
}

function AppShell() {
  const [ambientBackdrop, setAmbientBackdrop] = useState({
    current: "",
    previous: "",
    revision: 0,
  });
  const [dataReady, setDataReady] = useState(false);
  const [loaderPosters, setLoaderPosters] = useState([]);
  const [loaderPostersReady, setLoaderPostersReady] = useState(false);
  const bootCompleted = useRef(false);
  const requestedBackdrop = useRef("");
  const preloadedBackdrops = useRef(new Set());
  useRemoteNavigation();

  const completeBoot = useCallback(() => {
    if (!bootCompleted.current) {
      bootCompleted.current = true;
      setDataReady(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      window.localStorage.removeItem(LEGACY_LOADER_POSTER_CACHE_KEY);
    } catch {
      // Storage cleanup is optional in restricted browsing modes.
    }

    api
      .getLoaderPosters(35)
      .then((posters) => {
        if (!cancelled) {
          setLoaderPosters(
            [...new Set((posters || []).filter(Boolean))].slice(0, 35),
          );
        }
      })
      .catch((error) => {
        console.warn("RainFlix loader could not prepare its posters:", error);
      })
      .finally(() => {
        if (!cancelled) {
          setLoaderPostersReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateBackdrop = useCallback((imageUrl) => {
    if (!imageUrl || requestedBackdrop.current === imageUrl) {
      return;
    }

    requestedBackdrop.current = imageUrl;

    const showBackdrop = () => {
      if (requestedBackdrop.current !== imageUrl) {
        return;
      }

      setAmbientBackdrop((backdrop) => {
        if (backdrop.current === imageUrl) {
          return backdrop;
        }

        return {
          current: imageUrl,
          previous: backdrop.current,
          revision: backdrop.revision + 1,
        };
      });
    };

    if (preloadedBackdrops.current.has(imageUrl)) {
      showBackdrop();
      return;
    }

    const image = new Image();
    image.onload = () => {
      preloadedBackdrops.current.add(imageUrl);
      showBackdrop();
    };
    image.src = imageUrl;
  }, []);

  useEffect(() => {
    if (!ambientBackdrop.previous) {
      return undefined;
    }

    const revision = ambientBackdrop.revision;
    const timer = window.setTimeout(() => {
      setAmbientBackdrop((backdrop) =>
        backdrop.revision === revision
          ? { ...backdrop, previous: "" }
          : backdrop,
      );
    }, BACKDROP_FADE_DURATION);

    return () => window.clearTimeout(timer);
  }, [ambientBackdrop.previous, ambientBackdrop.revision]);

  useEffect(() => {
    const preventImageDrag = (event) => {
      if (event.target instanceof HTMLImageElement) {
        event.preventDefault();
      }
    };

    document.addEventListener("dragstart", preventImageDrag);
    return () => document.removeEventListener("dragstart", preventImageDrag);
  }, []);

  return (
    <>
      <AppLoader
        dataReady={dataReady && loaderPostersReady}
        posters={loaderPosters}
      />
      <div className="ambient-backdrop" aria-hidden="true">
        {ambientBackdrop.previous ? (
          <div
            className="ambient-backdrop-layer ambient-backdrop-previous"
            style={{
              backgroundImage: `url("${ambientBackdrop.previous.replaceAll('"', "%22")}")`,
            }}
            key={`previous-${ambientBackdrop.revision}`}
          />
        ) : null}
        {ambientBackdrop.current ? (
          <div
            className="ambient-backdrop-layer ambient-backdrop-current"
            style={{
              backgroundImage: `url("${ambientBackdrop.current.replaceAll('"', "%22")}")`,
            }}
            key={`current-${ambientBackdrop.revision}`}
          />
        ) : null}
      </div>
      <div id="app-shell" className="relative z-10 flex min-h-screen flex-col">
        <button
          className="fixed left-4 top-3 z-[500] -translate-y-20 rounded-lg bg-sky-400 px-4 py-3 text-sm font-black text-slate-950 shadow-xl transition focus:translate-y-0 focus:outline-none focus:ring-4 focus:ring-white/30"
          type="button"
          onClick={() => {
            const main = document.querySelector("#app-view");
            main?.focus({ preventScroll: true });
            main?.scrollIntoView({ behavior: "auto", block: "start" });
          }}
        >
          Skip to content
        </button>
        <div id="site-header" className="sticky top-0 z-[200]">
          <Header />
        </div>
        <main id="app-view" className="flex-1 outline-none" tabIndex="-1">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route
                path="/title/:mediaType/:id"
                element={
                  <TitlePage
                    onReady={completeBoot}
                    onBackdrop={updateBackdrop}
                  />
                }
              />
              <Route
                path="/addon/:addonId/catalog/:type/:catalogId"
                element={<AddonCatalogPage onReady={completeBoot} />}
              />
              <Route
                path="/addon/:addonId/title/:type/:id"
                element={
                  <AddonTitlePage
                    onReady={completeBoot}
                    onBackdrop={updateBackdrop}
                  />
                }
              />
              <Route
                path="/addons"
                element={<AddonsPage onReady={completeBoot} />}
              />
              <Route path="/" element={<Navigate replace to="/home" />} />
              <Route
                path="/home"
                element={
                  <CatalogPage
                    mode="home"
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/movies"
                element={
                  <CatalogPage
                    mode="movies"
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/series"
                element={
                  <CatalogPage
                    mode="series"
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/genre/:genre"
                element={
                  <CatalogPage
                    mode="genre"
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/year/:year"
                element={
                  <CatalogPage
                    mode="year"
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/library"
                element={
                  <LibraryPage
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/search"
                element={
                  <SearchPage
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route
                path="/watch/:mediaType/:id/:season?/:episode?"
                element={
                  <WatchPage
                    onBackdrop={updateBackdrop}
                    onReady={completeBoot}
                  />
                }
              />
              <Route path="*" element={<Navigate replace to="/home" />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
      <ScrollManager />
      {config.analyticsScriptUrl && config.analyticsWebsiteId ? (
        <Suspense fallback={null}>
          <PrivacyAnalytics />
        </Suspense>
      ) : null}
    </>
  );
}

export default function App() {
  return (
    <LibraryProvider>
      <DetailsProvider>
        <AppShell />
      </DetailsProvider>
    </LibraryProvider>
  );
}
