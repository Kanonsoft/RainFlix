import { useCallback, useEffect, useRef, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import AppLoader from "./components/AppLoader.jsx";
import Footer from "./components/Footer.jsx";
import Header from "./components/Header.jsx";
import { DetailsProvider } from "./components/details/DetailsProvider.jsx";
import useRemoteNavigation from "./hooks/useRemoteNavigation.js";
import { api } from "./lib/api.js";
import CatalogPage from "./pages/CatalogPage.jsx";
import WatchPage from "./pages/WatchPage.jsx";

const LOADER_POSTER_CACHE_KEY = "rainflix:loader-posters:v1";

function initialLoaderPosters() {
  try {
    const cached = JSON.parse(
      window.localStorage.getItem(LOADER_POSTER_CACHE_KEY) || "[]",
    );

    if (Array.isArray(cached) && cached.length) {
      return cached;
    }
  } catch {
    // The API's fallback posters are used when storage is unavailable.
  }

  return api.getLoaderPosters(35);
}

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

function AppShell() {
  const [ambientBackdrop, setAmbientBackdrop] = useState("");
  const [dataReady, setDataReady] = useState(false);
  const [loaderPosters, setLoaderPosters] = useState(initialLoaderPosters);
  const bootCompleted = useRef(false);
  useRemoteNavigation();

  const completeBoot = useCallback((posters = []) => {
    const uniquePosters = [...new Set(posters.filter(Boolean))].slice(0, 35);

    if (uniquePosters.length) {
      setLoaderPosters(uniquePosters);

      try {
        window.localStorage.setItem(
          LOADER_POSTER_CACHE_KEY,
          JSON.stringify(uniquePosters),
        );
      } catch {
        // Poster caching is optional.
      }
    }

    if (!bootCompleted.current) {
      bootCompleted.current = true;
      setDataReady(true);
    }
  }, []);

  const updateBackdrop = useCallback((imageUrl) => {
    if (imageUrl) {
      setAmbientBackdrop(imageUrl);
    }
  }, []);

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
      <AppLoader dataReady={dataReady} posters={loaderPosters} />
      <div
        className={`ambient-backdrop${
          ambientBackdrop ? " is-visible" : ""
        }`}
        style={
          ambientBackdrop
            ? { backgroundImage: `url("${ambientBackdrop.replaceAll('"', "%22")}")` }
            : undefined
        }
        aria-hidden="true"
      />
      <div className="relative z-10 flex min-h-screen flex-col">
        <div id="site-header" className="sticky top-0 z-[200]">
          <Header />
        </div>
        <main id="app-view" className="flex-1 outline-none" tabIndex="-1">
          <Routes>
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
        </main>
        <Footer />
      </div>
      <ScrollManager />
    </>
  );
}

export default function App() {
  return (
    <DetailsProvider>
      <AppShell />
    </DetailsProvider>
  );
}
