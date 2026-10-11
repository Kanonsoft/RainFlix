import { useEffect, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { MediaGrid } from "../components/MediaCard.jsx";
import { useLibrary } from "../components/library/LibraryProvider.jsx";
import { watchPath } from "../lib/api.js";
import { usePageMetadata } from "../lib/metadata.js";
import { isNativeApp } from "../platform/index.js";

export default function LibraryPage({ onBackdrop, onReady }) {
  const { clearRecentlyViewed, myList, recentlyViewed, watched } = useLibrary();
  const resumable = useMemo(
    () =>
      recentlyViewed.map((item) => ({
        ...item,
        resumeLabel:
          item.mediaType === "tv"
            ? `S${item.season}:E${item.episode}`
            : "Resume",
        resumePath: item.detailPath
          ? `${item.detailPath}${item.videoId ? `${item.detailPath.includes("?") ? "&" : "?"}video=${encodeURIComponent(item.videoId)}` : ""}`
          : watchPath(item, item.season, item.episode),
      })),
    [recentlyViewed],
  );
  const backdropItem = myList[0] || recentlyViewed[0] || watched[0];

  usePageMetadata({
    title: "My List",
    description:
      "Your saved RainFlix titles and recently opened movies and episodes.",
    image: backdropItem?.backdrop || backdropItem?.poster || "",
  });

  useEffect(() => {
    const images = [...myList, ...recentlyViewed, ...watched]
      .flatMap((item) => [item.poster, item.backdrop])
      .filter(Boolean);
    onReady?.(images);
  }, [myList, onReady, recentlyViewed, watched]);

  useEffect(() => {
    const image = backdropItem?.backdrop || backdropItem?.poster;
    if (image) {
      onBackdrop?.(image);
    }
  }, [backdropItem, onBackdrop]);

  return (
    <section
      className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12"
      aria-labelledby="libraryTitle"
    >
      <header className="border-b border-blue-950/80 pb-7">
        <p className="text-xs font-black uppercase text-sky-300">
          Personal library
        </p>
        <h1
          id="libraryTitle"
          className="mt-2 text-3xl font-black text-slate-50 md:text-4xl"
        >
          My List
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400 md:text-base">
          Saved titles and recent watch pages stay on this device.
        </p>
      </header>

      <section className="mt-9" aria-labelledby="savedTitlesHeading">
        <div className="mb-5 flex items-center gap-3">
          <h2
            id="savedTitlesHeading"
            className="text-2xl font-black text-slate-50 md:text-3xl"
          >
            Saved titles
          </h2>
          <span className="text-sm font-bold text-slate-500">
            {myList.length}
          </span>
        </div>
        <MediaGrid
          items={myList}
          browse
          emptyText="Your list is empty. Use the bookmark button on any title to save it here."
        />
      </section>

      {isNativeApp && (
        <>
          <section className="mt-12" aria-labelledby="continueWatchingHeading">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <h2
                id="continueWatchingHeading"
                className="text-2xl font-black text-slate-50 md:text-3xl"
              >
                Continue watching
              </h2>
              {resumable.length ? (
                <button
                  className="ml-auto inline-flex items-center gap-2 rounded-lg border border-blue-900/80 px-3 py-2 text-xs font-black text-slate-300 transition hover:border-sky-500 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
                  type="button"
                  onClick={clearRecentlyViewed}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Clear history
                </button>
              ) : null}
            </div>
            <MediaGrid
              items={resumable}
              browse
              emptyText="No unfinished playback."
            />
          </section>
          <section className="mt-12" aria-labelledby="watchedHeading">
            <div className="mb-5 flex items-center gap-3">
              <h2
                id="watchedHeading"
                className="text-2xl font-black text-slate-50 md:text-3xl"
              >
                Watched
              </h2>
              <span className="text-sm font-bold text-slate-500">
                {watched.length}
              </span>
            </div>
            <MediaGrid
              browse
              items={watched.map((item) => ({
                ...item,
                historyKind: "watched",
                detailPath: item.detailPath ? item.detailPath : watchPath(item),
                resumeLabel: "Watched",
              }))}
              emptyText="No watched titles yet."
            />
          </section>
        </>
      )}
    </section>
  );
}
