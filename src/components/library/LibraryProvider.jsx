import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api, trackEvent } from "../../lib/api.js";

const LibraryContext = createContext(null);
const MY_LIST_KEY = "rainflix:my-list:v1";
const RECENT_KEY = "rainflix:recently-viewed:v1";
const MAX_SAVED_TITLES = 100;
const MAX_RECENT_TITLES = 24;

function titleKey(item) {
  return `${api.normalizeMediaType(item?.mediaType)}:${String(item?.id || "")}`;
}

function readStoredList(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStoredList(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Personalization remains optional when storage is unavailable.
  }
}

function normalizeTitle(item) {
  return {
    id: item.id,
    mediaType: api.normalizeMediaType(item.mediaType),
    title: item.title || "Untitled",
    year: item.year || "TBA",
    rating: item.rating || "NR",
    poster: item.poster || "",
    backdrop: item.backdrop || "",
    logo: item.logo || "",
    synopsis: item.synopsis || "No synopsis available yet.",
  };
}

export function LibraryProvider({ children }) {
  const [myList, setMyList] = useState(() => readStoredList(MY_LIST_KEY));
  const [recentlyViewed, setRecentlyViewed] = useState(() =>
    readStoredList(RECENT_KEY),
  );

  useEffect(() => writeStoredList(MY_LIST_KEY, myList), [myList]);
  useEffect(
    () => writeStoredList(RECENT_KEY, recentlyViewed),
    [recentlyViewed],
  );

  useEffect(() => {
    const syncStorage = (event) => {
      if (event.key === MY_LIST_KEY) {
        setMyList(readStoredList(MY_LIST_KEY));
      } else if (event.key === RECENT_KEY) {
        setRecentlyViewed(readStoredList(RECENT_KEY));
      }
    };

    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, []);

  const isInMyList = useCallback(
    (item) => {
      const key = titleKey(item);
      return myList.some((saved) => titleKey(saved) === key);
    },
    [myList],
  );

  const toggleMyList = useCallback((item) => {
    if (!item?.id) {
      return;
    }

    setMyList((current) => {
      const key = titleKey(item);
      const exists = current.some((saved) => titleKey(saved) === key);
      trackEvent(exists ? "my-list-remove" : "my-list-add", {
        mediaType: api.normalizeMediaType(item.mediaType),
      });

      if (exists) {
        return current.filter((saved) => titleKey(saved) !== key);
      }

      return [
        { ...normalizeTitle(item), savedAt: Date.now() },
        ...current,
      ].slice(0, MAX_SAVED_TITLES);
    });
  }, []);

  const recordViewed = useCallback((item, season = 1, episode = 1) => {
    if (!item?.id) {
      return;
    }

    const entry = {
      ...normalizeTitle(item),
      episode: Math.max(1, Number.parseInt(episode, 10) || 1),
      season: Math.max(1, Number.parseInt(season, 10) || 1),
      viewedAt: Date.now(),
    };

    setRecentlyViewed((current) =>
      [
        entry,
        ...current.filter((saved) => titleKey(saved) !== titleKey(entry)),
      ].slice(0, MAX_RECENT_TITLES),
    );
  }, []);

  const clearRecentlyViewed = useCallback(() => setRecentlyViewed([]), []);

  const value = useMemo(
    () => ({
      clearRecentlyViewed,
      isInMyList,
      myList,
      recentlyViewed,
      recordViewed,
      toggleMyList,
    }),
    [
      clearRecentlyViewed,
      isInMyList,
      myList,
      recentlyViewed,
      recordViewed,
      toggleMyList,
    ],
  );

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  );
}

export function useLibrary() {
  const context = useContext(LibraryContext);

  if (!context) {
    throw new Error("useLibrary must be used inside LibraryProvider.");
  }

  return context;
}
