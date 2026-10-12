import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { MediaGrid } from "../components/MediaCard.jsx";
import { contentRecommendations } from "../lib/recommendations.js";
import { usePageMetadata } from "../lib/metadata.js";

function Results({ mediaType, id, onReady, onBackdrop }) {
  const [state, setState] = useState({ items: [], loading: true, page: 1 });
  const [retry, setRetry] = useState(0);
  const sentinel = useRef(null);
  const controller = useRef(null);
  const pending = useRef(false);
  usePageMetadata({
    title: state.title
      ? `More like ${state.title.title} | RainFlix`
      : "More like this | RainFlix",
    image: state.title?.backdrop,
  });
  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    pending.current = false;
    setState({ items: [], loading: true, page: 1 });
    contentRecommendations(mediaType, id, { signal: request.signal })
      .then((feed) => {
        if (request.signal.aborted) return;
        setState({ ...feed, loading: false });
        onBackdrop?.(feed.title.backdrop || feed.title.poster);
        onReady?.([]);
      })
      .catch(() => {
        if (!request.signal.aborted) {
          setState({ items: [], loading: false, error: true, page: 1 });
          onReady?.([]);
        }
      });
    return () => request.abort();
  }, [mediaType, id, retry, onReady, onBackdrop]);
  const loadMore = useCallback(async () => {
    if (
      pending.current ||
      state.loading ||
      !state.hasMore ||
      controller.current?.signal.aborted
    )
      return;
    pending.current = true;
    const signal = controller.current.signal;
    setState((current) => ({
      ...current,
      loadingMore: true,
      moreError: false,
    }));
    try {
      const feed = await contentRecommendations(mediaType, id, {
        page: state.page + 1,
        signal,
      });
      if (!signal.aborted)
        setState((current) => {
          const seen = new Set(
            current.items.map((item) => `${item.mediaType}:${item.id}`),
          );
          return {
            ...current,
            items: [
              ...current.items,
              ...feed.items.filter(
                (item) => !seen.has(`${item.mediaType}:${item.id}`),
              ),
            ],
            page: feed.page,
            hasMore: feed.hasMore,
            loadingMore: false,
          };
        });
    } catch {
      if (!signal.aborted)
        setState((current) => ({
          ...current,
          loadingMore: false,
          moreError: true,
        }));
    } finally {
      pending.current = false;
    }
  }, [state.loading, state.hasMore, state.page, mediaType, id]);
  useEffect(() => {
    if (
      !sentinel.current ||
      state.loadingMore ||
      state.moreError ||
      !state.hasMore
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
  }, [loadMore, state.hasMore, state.loadingMore, state.moreError]);
  return (
    <section className="mx-auto w-full max-w-[1800px] px-4 pb-16 pt-8 md:px-8">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-black md:text-3xl">
          {state.title ? `More like ${state.title.title}` : "More like this"}
        </h1>
        <Link
          to={`/title/${mediaType}/${id}`}
          className="inline-flex min-h-11 items-center text-sm text-sky-300 hover:text-sky-100"
        >
          Back to title
        </Link>
      </div>
      {state.error ? (
        <div role="alert">
          <p>Recommendations could not be loaded.</p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="mt-4 min-h-11 rounded-lg bg-sky-400 px-5 font-bold text-slate-950"
          >
            Retry
          </button>
        </div>
      ) : (
        <MediaGrid
          items={state.items}
          loading={state.loading}
          browse
          ghostCount={state.loadingMore ? 12 : 0}
          emptyText="No matching recommendations available."
        />
      )}
      {state.hasMore && (
        <div ref={sentinel} className="mt-6 min-h-1">
          {state.moreError && (
            <button
              type="button"
              onClick={loadMore}
              className="min-h-11 text-sky-300"
            >
              Retry
            </button>
          )}
        </div>
      )}
    </section>
  );
}
export default function SimilarPage(props) {
  const { mediaType, id } = useParams();
  return (
    <Results
      key={`${mediaType}:${id}`}
      mediaType={mediaType}
      id={id}
      {...props}
    />
  );
}
