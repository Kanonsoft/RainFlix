import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import HeroCarousel from "../components/HeroCarousel.jsx";
import {
  CardSkeleton,
  MediaCard,
  MediaGrid,
} from "../components/MediaCard.jsx";
import ViewportCatalog from "../components/ViewportCatalog.jsx";
import { api, imageFallback, watchPath } from "../lib/api.js";
import { usePageMetadata } from "../lib/metadata.js";

function useAnimeFeed(kind, limit = 12) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({
    items: [],
    loading: true,
    error: false,
  });
  useEffect(() => {
    let active = true;
    setState({ items: [], loading: true, error: false });
    api.getAnimeFeed(kind, limit).then(
      (items) => {
        if (active) setState({ items, loading: false, error: false });
      },
      () => {
        if (active) setState({ items: [], loading: false, error: true });
      },
    );
    return () => {
      active = false;
    };
  }, [kind, limit, revision]);
  return { ...state, retry: () => setRevision((value) => value + 1) };
}

function Retry({ retry }) {
  return (
    <button
      type="button"
      onClick={retry}
      className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15"
    >
      <RotateCcw className="h-4 w-4" />
      Retry
    </button>
  );
}

function PagedAnime({ state, title, desktopSize = 10 }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() =>
    window.matchMedia("(min-width: 1024px)").matches ? desktopSize : 9,
  );
  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      setPageSize(breakpoint.matches ? desktopSize : 9);
      setPage(1);
    };
    breakpoint.addEventListener("change", update);
    return () => breakpoint.removeEventListener("change", update);
  }, [desktopSize]);
  const total = Math.max(1, Math.ceil(state.items.length / pageSize));
  const current = Math.min(page, total);
  const items = state.items.slice((current - 1) * pageSize, current * pageSize);
  return (
    <>
      {state.loading || state.items.length ? (
        <div
          className={`grid grid-cols-3 gap-2 sm:gap-4 ${desktopSize === 12 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}
        >
          {!state.loading &&
            items.map((item) => <MediaCard key={item.id} item={item} />)}
          {Array.from(
            { length: state.loading ? pageSize : pageSize - items.length },
            (_, index) => (
              <div
                key={`slot-${index}`}
                data-anime-slot
                className={state.loading ? "" : "invisible"}
                aria-hidden="true"
              >
                <CardSkeleton
                  detailed
                  episodeDate={Boolean(state.items[0]?.episodeDate)}
                />
              </div>
            ),
          )}
        </div>
      ) : (
        <p className="py-8 text-sm text-slate-400">No anime listed yet.</p>
      )}
      <nav
        aria-label={`${title} pages`}
        className="mt-6 flex items-center justify-between border-t border-white/10 pt-4"
      >
        <button
          type="button"
          aria-label={`Previous ${title} page`}
          title="Previous page"
          disabled={state.loading || current <= 1}
          onClick={() => setPage(current - 1)}
          className="grid h-11 w-11 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-25"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span
          aria-live="polite"
          className="text-sm tabular-nums text-slate-300"
        >
          {current} / {total}
        </span>
        <button
          type="button"
          aria-label={`Next ${title} page`}
          title="Next page"
          disabled={state.loading || current >= total}
          onClick={() => setPage(current + 1)}
          className="grid h-11 w-11 place-items-center rounded-lg transition hover:bg-white/10 disabled:opacity-25"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
      </nav>
    </>
  );
}

function AnimeSection({ kind, title }) {
  const state = useAnimeFeed(kind, kind === "schedule" ? 12 : 60);
  const [day, setDay] = useState(0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      label:
        index === 0
          ? "Today"
          : date.toLocaleDateString(undefined, { weekday: "short" }),
      date: date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
    };
  });
  return (
    <section aria-label={title} className="py-6 md:py-8">
      <h2 className="mb-5 text-xl font-bold md:text-2xl">{title}</h2>
      {state.error ? (
        <div
          role="status"
          className="flex items-center justify-between gap-4 border-y border-white/10 py-5"
        >
          <p className="text-slate-300">Could not load this section.</p>
          <Retry retry={state.retry} />
        </div>
      ) : kind !== "schedule" ? (
        <PagedAnime
          state={state}
          title={title}
          desktopSize={kind === "new" ? 12 : 10}
        />
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Release day"
            className="mb-5 grid grid-cols-7 gap-1 border-b border-white/15"
          >
            {days.map((date, index) => (
              <button
                key={date.key}
                type="button"
                role="tab"
                aria-selected={day === index}
                aria-controls="animeSchedule"
                id={`animeDay${index}`}
                onClick={() => setDay(index)}
                className={`min-h-16 border-b-2 px-1 py-2 text-xs sm:text-sm ${day === index ? "border-sky-400 text-sky-300" : "border-transparent text-slate-300 hover:text-white"}`}
              >
                <span className="block font-bold">{date.label}</span>
                <span className="mt-1 block text-[10px] sm:text-xs">
                  {date.date}
                </span>
              </button>
            ))}
          </div>
          <div
            id="animeSchedule"
            role="tabpanel"
            aria-labelledby={`animeDay${day}`}
          >
            {state.loading ? (
              <MediaGrid items={[]} loading />
            ) : (
              <div className="grid gap-x-8 md:grid-cols-2">
                {state.items
                  .filter((item) => item.episodeDate === days[day].key)
                  .map((item) => (
                    <Link
                      key={item.id}
                      to={item.detailPath}
                      className="flex min-w-0 items-center gap-4 border-b border-white/10 py-4 transition hover:bg-white/5 focus-visible:outline-sky-400"
                    >
                      <img
                        src={item.poster || imageFallback(item.title)}
                        alt=""
                        draggable={false}
                        loading="lazy"
                        className="h-20 w-14 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-bold sm:text-base">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-sm text-sky-300">
                          Season {item.season} &middot; Episode {item.episode}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.episodeTitle}
                        </p>
                      </div>
                    </Link>
                  ))}
                {!state.items.some(
                  (item) => item.episodeDate === days[day].key,
                ) && (
                  <p className="col-span-full py-8 text-sm text-slate-400">
                    No episode releases listed for this day.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export default function AnimePage({ onBackdrop, onReady }) {
  const trending = useAnimeFeed("trending", 10);
  const [hero, setHero] = useState([]);
  usePageMetadata({
    title: "RainFlix Anime",
    description:
      "Discover trending anime, recent episodes and upcoming releases.",
  });
  useEffect(() => {
    if (!trending.loading) onReady?.();
  }, [trending.loading, onReady]);
  useEffect(() => {
    let active = true;
    setHero(trending.items);
    if (trending.items.length)
      api
        .getTitleLogos(trending.items)
        .then((items) => {
          if (active) setHero(items);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [trending.items]);
  return (
    <div
      aria-label="Anime catalog"
      className="mx-auto w-full max-w-[1440px] px-6 py-8 md:px-10 lg:px-12"
    >
      <HeroCarousel items={hero} onBackdrop={onBackdrop} />
      <div className="pb-10">
        <div className="border-b border-white/10 pb-5 pt-8">
          <h1 className="text-3xl font-bold">
            RainFlix <span className="text-sky-300">Anime</span>
          </h1>
        </div>
        <div className="grid items-start gap-x-8 lg:grid-cols-[minmax(0,1fr)_280px] xl:gap-x-10">
          <div className="min-w-0">
            <ViewportCatalog>
              <AnimeSection kind="recent" title="Recently updated episodes" />
            </ViewportCatalog>
          </div>
          <aside
            aria-label="Trending anime this week"
            className="min-w-0 border-t border-white/10 py-6 lg:border-l lg:border-t-0 lg:pl-6 lg:py-8"
          >
            <h2 className="mb-5 text-lg font-bold">Trending anime this week</h2>
            {trending.error ? (
              <Retry retry={trending.retry} />
            ) : (
              <ol className="divide-y divide-white/10">
                {trending.items.slice(0, 10).map((item, index) => (
                  <li key={item.id}>
                    <Link
                      to={watchPath(item)}
                      className="group flex min-w-0 items-center gap-3 py-3 transition hover:bg-white/5"
                    >
                      <span
                        className={`w-7 shrink-0 text-center text-2xl font-bold tabular-nums ${index < 3 ? "text-sky-300" : "text-slate-500"}`}
                      >
                        {index + 1}
                      </span>
                      <img
                        src={item.poster || imageFallback(item.title)}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="h-16 w-11 shrink-0 rounded object-cover"
                      />
                      <div className="min-w-0">
                        <h3 className="line-clamp-2 text-sm font-bold group-hover:text-sky-200">
                          {item.title}
                        </h3>
                        <p className="mt-2 text-xs text-slate-400">
                          {item.year} &middot;{" "}
                          <span className="text-sky-300">{item.rating}</span>
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
        <ViewportCatalog>
          <AnimeSection kind="new" title="New anime" />
        </ViewportCatalog>
        <ViewportCatalog>
          <AnimeSection kind="schedule" title="Episode release schedule" />
        </ViewportCatalog>
      </div>
    </div>
  );
}
