import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api, trackEvent } from "../../lib/api.js";
import {
  episodeCounts,
  groupWatchedHistory,
  seriesFinished,
  remainingEpisode,
} from "../../lib/library-history.js";
import {
  clearPlaybackProgress,
  removeTitlePlaybackProgress,
  readPlaybackSample,
  playbackIdentity,
  playbackFinished,
} from "../../lib/playback-progress.js";

const LibraryContext = createContext(null);
const MY_LIST_KEY = "rainflix:my-list:v1";
const RECENT_KEY = "rainflix:recently-viewed:v1";
const WATCHED_KEY = "rainflix:watched:v1";
const MAX_SAVED_TITLES = 100;
const MAX_RECENT_TITLES = 24;

function titleKey(item) {
  return `${api.normalizeMediaType(item?.mediaType)}:${String(item?.id || "")}`;
}

function watchedKey(item) {
  return `${titleKey(item)}${item.mediaType === "tv" ? `:${item.season}:${item.episode}` : ""}`;
}

function historyEntry(item, season, episode, videoId) {
  return {
    ...normalizeTitle(item),
    season: Math.max(0, Number.parseInt(season, 10) || 0),
    episode: Math.max(1, Number.parseInt(episode, 10) || 1),
    viewedAt: Date.now(),
    ...(videoId ? { videoId } : {}),
  };
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
    ...(item.mediaType === "tv"
      ? {
          seasonEpisodeCounts: episodeCounts(
            item.seasonEpisodeCounts || item.seasons,
          ),
        }
      : {}),
    ...(item.detailPath ? { detailPath: item.detailPath } : {}),
    ...(Number.isInteger(item.sourceEpisodeNumber)
      ? { sourceEpisodeNumber: item.sourceEpisodeNumber }
      : {}),
    ...(Number.isInteger(item.sourceSeasonNumber)
      ? { sourceSeasonNumber: item.sourceSeasonNumber }
      : {}),
  };
}

export function LibraryProvider({ children }) {
  const [myList, setMyList] = useState(() => readStoredList(MY_LIST_KEY));
  const [recentlyViewed, setRecentlyViewed] = useState(() =>
    readStoredList(RECENT_KEY),
  );
  const legacySeries = useRef(new Set());
  const [watchedHistory, setWatchedHistory] = useState(() => {
    const stored = readStoredList(WATCHED_KEY);
    legacySeries.current = new Set(
      stored
        .filter(
          (item) =>
            item?.mediaType === "tv" && !Array.isArray(item.watchedEpisodes),
        )
        .map(titleKey),
    );
    return groupWatchedHistory(stored);
  });
  const watchedRef = useRef(watchedHistory);
  const watched = useMemo(
    () => watchedHistory.filter(seriesFinished),
    [watchedHistory],
  );
  const updateWatched = useCallback((items) => {
    watchedRef.current = groupWatchedHistory(items);
    setWatchedHistory(watchedRef.current);
  }, []);
  useEffect(
    () => writeStoredList(WATCHED_KEY, watchedHistory),
    [watchedHistory],
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
        const marked = new Set(
          watchedRef.current.filter((item) => item.markedWatched).map(titleKey),
        );
        setRecentlyViewed(
          readStoredList(RECENT_KEY).filter(
            (item) => !marked.has(titleKey(item)),
          ),
        );
      } else if (event.key === WATCHED_KEY) {
        updateWatched(readStoredList(WATCHED_KEY));
        const marked = new Set(
          watchedRef.current.filter((item) => item.markedWatched).map(titleKey),
        );
        setRecentlyViewed((current) =>
          current.filter((item) => !marked.has(titleKey(item))),
        );
      }
    };

    window.addEventListener("storage", syncStorage);
    return () => window.removeEventListener("storage", syncStorage);
  }, [updateWatched]);

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

  const recordViewed = useCallback(
    (item, season = 1, episode = 1, videoId) => {
      if (!item?.id) {
        return;
      }

      const entry = historyEntry(item, season, episode, videoId);
      const previous = watchedRef.current.find(
        (saved) => titleKey(saved) === titleKey(entry),
      );
      if (
        previous &&
        (previous.markedWatched ||
          (entry.seasonEpisodeCounts?.length &&
            JSON.stringify(previous.seasonEpisodeCounts) !==
              JSON.stringify(entry.seasonEpisodeCounts)))
      ) {
        updateWatched(
          watchedRef.current.map((saved) =>
            titleKey(saved) === titleKey(entry)
              ? {
                  ...saved,
                  markedWatched: false,
                  seasonEpisodeCounts: entry.seasonEpisodeCounts?.length
                    ? entry.seasonEpisodeCounts
                    : saved.seasonEpisodeCounts,
                }
              : saved,
          ),
        );
      }

      setRecentlyViewed((current) =>
        [
          entry,
          ...current.filter((saved) => titleKey(saved) !== titleKey(entry)),
        ].slice(0, MAX_RECENT_TITLES),
      );
    },
    [updateWatched],
  );

  const clearRecentlyViewed = useCallback(() => {
    clearPlaybackProgress();
    setRecentlyViewed([]);
  }, []);

  const removeFromHistory = useCallback((item) => {
    setRecentlyViewed((current) =>
      current.filter((saved) => titleKey(saved) !== titleKey(item)),
    );
    removeTitlePlaybackProgress(item);
  }, []);
  const markWatched = useCallback(
    (item, season = 1, episode = 1, videoId, videos = []) => {
      if (!item?.id) return;
      const entry = {
        ...historyEntry(item, season, episode, videoId),
        watchedAt: Date.now(),
      };
      removeTitlePlaybackProgress(entry, true);
      updateWatched([...watchedRef.current, entry]);
      const history = watchedRef.current.find(
        (saved) => titleKey(saved) === titleKey(entry),
      );
      const complete = seriesFinished(history);
      const next = !complete && remainingEpisode(history, videos);
      setRecentlyViewed((current) => {
        const others = current.filter(
          (saved) => titleKey(saved) !== titleKey(entry),
        );
        if (complete) return others;
        const existing = current.find(
          (saved) => titleKey(saved) === titleKey(entry),
        );
        if (existing && watchedKey(existing) !== watchedKey(entry))
          return current;
        return [{ ...entry, ...(next || {}) }, ...others].slice(
          0,
          MAX_RECENT_TITLES,
        );
      });
    },
    [updateWatched],
  );
  const markTitleWatched = useCallback(
    (item) => {
      if (!item?.id) return;
      const entry = {
        ...historyEntry(
          item,
          item.season ?? 1,
          item.episode ?? 1,
          item.videoId,
        ),
        watchedAt: Date.now(),
        markedWatched: true,
      };
      removeTitlePlaybackProgress(entry);
      updateWatched([...watchedRef.current, entry]);
      setRecentlyViewed((current) =>
        current.filter((saved) => titleKey(saved) !== titleKey(entry)),
      );
    },
    [updateWatched],
  );
  const removeWatched = useCallback(
    (item) => {
      updateWatched(
        watchedRef.current.filter(
          (saved) => titleKey(saved) !== titleKey(item),
        ),
      );
    },
    [updateWatched],
  );
  const markUnwatched = useCallback(
    (item) => {
      removeWatched(item);
      removeTitlePlaybackProgress(item);
      const firstSeason = item.seasonEpisodeCounts?.[0]?.seasonNumber ?? 1;
      const videoId = /^(?:tt\d+|\d+):\d+:\d+$/.test(item.videoId || "")
        ? `${item.videoId.split(":")[0]}:${firstSeason}:1`
        : undefined;
      recordViewed(
        {
          ...item,
          sourceSeasonNumber: undefined,
          sourceEpisodeNumber: undefined,
        },
        firstSeason,
        1,
        videoId,
      );
    },
    [removeWatched, recordViewed],
  );

  const restoredHistory = useRef(false);
  useEffect(() => {
    if (restoredHistory.current) return;
    restoredHistory.current = true;
    // Old per-episode Watched entries must not strand unfinished series off Home.
    setRecentlyViewed((current) => {
      const marked = new Set(
        watchedRef.current.filter((item) => item.markedWatched).map(titleKey),
      );
      const unfinished = current.filter((item) => !marked.has(titleKey(item)));
      const titles = new Set(unfinished.map(titleKey));
      const restored = watchedRef.current
        .filter(
          (item) =>
            item.mediaType === "tv" &&
            legacySeries.current.has(titleKey(item)) &&
            !seriesFinished(item) &&
            !titles.has(titleKey(item)),
        )
        .map((item) => ({
          ...item,
          ...(remainingEpisode(item) || {}),
        }));
      return [...unfinished, ...restored].slice(0, MAX_RECENT_TITLES);
    });
    for (const item of recentlyViewed) {
      const details = /^\d+$/.test(String(item.id))
        ? { ...item, tmdbDetails: item }
        : {
            ...item,
            imdbId: /^tt\d+$/.test(String(item.id)) ? item.id : undefined,
            addonId: String(item.id),
            addonType: item.mediaType === "tv" ? "series" : item.mediaType,
          };
      if (
        playbackFinished(
          readPlaybackSample(
            playbackIdentity(details, item.season, item.episode),
          ),
          item.mediaType,
        )
      ) {
        markWatched(item, item.season, item.episode, item.videoId);
      }
    }
  }, [recentlyViewed, markWatched]);

  const value = useMemo(
    () => ({
      clearRecentlyViewed,
      isInMyList,
      myList,
      recentlyViewed,
      recordViewed,
      toggleMyList,
      watched,
      markWatched,
      markTitleWatched,
      markUnwatched,
      removeWatched,
      removeFromHistory,
    }),
    [
      clearRecentlyViewed,
      isInMyList,
      myList,
      recentlyViewed,
      recordViewed,
      toggleMyList,
      watched,
      markWatched,
      markTitleWatched,
      markUnwatched,
      removeWatched,
      removeFromHistory,
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
