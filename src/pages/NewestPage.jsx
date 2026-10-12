import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api } from "../lib/api.js";
import { MediaGrid } from "../components/MediaCard.jsx";
import { usePageMetadata } from "../lib/metadata.js";

function Catalog({ mediaType, onBackdrop, onReady, genre, year }) {
  const [feed, setFeed] = useState({
    items: [],
    loading: true,
    page: 1,
    totalPages: 1,
  });
  const [revision, setRevision] = useState(0);
  const request = useRef(null),
    pending = useRef(false),
    sentinel = useRef(null);
  const title = mediaType === "tv" ? "Newest series" : "Newest movies";
  usePageMetadata({ title: `${title} | RainFlix` });
  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    pending.current = false;
    setFeed({ items: [], loading: true, page: 1, totalPages: 1 });
    api
      .getNewestTitles({ mediaType, genre, year })
      .then((result) => {
        if (controller.signal.aborted) return;
        setFeed({ ...result, loading: false });
        onReady?.([]);
        onBackdrop?.(result.items[0]?.backdrop);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFeed({
            items: [],
            loading: false,
            error: true,
            page: 1,
            totalPages: 1,
          });
          onReady?.([]);
        }
      });
    return () => controller.abort();
  }, [mediaType, genre, year, revision, onReady, onBackdrop]);
  const loadMore = useCallback(async () => {
    if (
      pending.current ||
      feed.loading ||
      feed.page >= feed.totalPages ||
      request.current?.signal.aborted
    )
      return;
    const signal = request.current.signal;
    pending.current = true;
    setFeed((current) => ({ ...current, loadingMore: true, moreError: false }));
    try {
      const result = await api.getNewestTitles({
        mediaType,
        genre,
        year,
        page: feed.page + 1,
      });
      if (!signal.aborted)
        setFeed((current) => {
          const ids = new Set(current.items.map((item) => item.id));
          const items = result.items.filter((item) => !ids.has(item.id));
          return {
            ...result,
            items: [...current.items, ...items],
            totalPages: items.length ? result.totalPages : result.page,
            loading: false,
            loadingMore: false,
          };
        });
    } catch {
      if (!signal.aborted)
        setFeed((current) => ({
          ...current,
          loadingMore: false,
          moreError: true,
        }));
    } finally {
      if (!signal.aborted) pending.current = false;
    }
  }, [feed.loading, feed.page, feed.totalPages, mediaType, genre, year]);
  useEffect(() => {
    if (
      !sentinel.current ||
      feed.loading ||
      feed.loadingMore ||
      feed.moreError ||
      feed.page >= feed.totalPages
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [
    loadMore,
    feed.loading,
    feed.loadingMore,
    feed.moreError,
    feed.page,
    feed.totalPages,
  ]);
  return (
    <section className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-6 md:px-8">
      <h1 className="mb-6 text-2xl font-black md:text-3xl">{title}</h1>
      {feed.error ? (
        <div role="alert">
          <p>The catalog could not be loaded.</p>
          <button
            type="button"
            className="mt-4 min-h-11 text-sky-300"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : (
        <MediaGrid
          browse
          items={feed.items}
          loading={feed.loading}
          ghostCount={feed.loadingMore ? 12 : 0}
        />
      )}
      {feed.page < feed.totalPages && (
        <div ref={sentinel} className="mt-6 min-h-1">
          {feed.moreError && (
            <button
              type="button"
              className="min-h-11 text-sky-300"
              onClick={loadMore}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export default function NewestPage(props) {
  const { mediaType } = useParams();
  const [params] = useSearchParams();
  const type = mediaType === "tv" ? "tv" : "movie",
    genre = params.get("genre") || "",
    year = params.get("year") || "";
  return (
    <Catalog
      key={`${type}:${genre}:${year}`}
      mediaType={type}
      genre={genre}
      year={year}
      {...props}
    />
  );
}
