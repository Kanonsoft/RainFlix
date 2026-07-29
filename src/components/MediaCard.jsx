import { Link } from "react-router";
import { api, imageFallback } from "../lib/api.js";
import { posterImageProps } from "../lib/images.js";
import { useDetails } from "./details/DetailsProvider.jsx";

export function MediaCard({ item }) {
  const { openDetails } = useDetails();
  const poster = item.poster || item.backdrop || imageFallback(item.title);
  const mainClass =
    "block w-full text-left outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-400/25";
  const cardContent = (
    <>
      <div className="relative isolate aspect-[2/3] overflow-hidden">
        <img
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-[0.58] group-focus-within:scale-105 group-focus-within:brightness-[0.58]"
          src={poster}
          alt={`${item.title} poster`}
          loading="lazy"
          decoding="async"
          draggable="false"
          {...posterImageProps(poster)}
          onError={(event) => {
            event.currentTarget.onerror = null;
            event.currentTarget.removeAttribute("srcset");
            event.currentTarget.src = imageFallback(item.title);
          }}
        />

        {item.resumeLabel ? (
          <span className="absolute left-2 top-2 z-10 rounded-md bg-slate-950/88 px-2 py-1 text-[0.65rem] font-black uppercase text-sky-200 shadow-lg backdrop-blur">
            {item.resumeLabel}
          </span>
        ) : null}

        <div className="absolute inset-0 flex translate-y-3 flex-col justify-end gap-3 bg-gradient-to-t from-slate-950 via-slate-950/78 to-transparent p-4 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
          <h3 className="text-xl font-black leading-tight text-slate-50">
            {item.title}
          </h3>
          <p className="line-clamp-3 text-xs leading-5 text-slate-300 md:line-clamp-4 md:text-sm md:leading-6">
            {item.synopsis}
          </p>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <h3 className="truncate text-sm font-black text-slate-50">
          {item.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <span className="rounded-full bg-blue-500/20 px-2 py-1 font-black text-sky-200">
            {item.rating}
          </span>
          <span>{item.year}</span>
          <span className="rounded-full bg-sky-400/15 px-2 py-1 font-black uppercase text-sky-300">
            {api.mediaLabel(item.mediaType)}
          </span>
        </div>
      </div>
    </>
  );

  return (
    <article className="catalog-card group relative overflow-hidden rounded-lg border border-blue-900/70 bg-slate-950 transition duration-300 hover:-translate-y-1 hover:border-sky-500/70 focus-within:-translate-y-1 focus-within:border-sky-500/70">
      {item.resumePath ? (
        <Link
          className={mainClass}
          to={item.resumePath}
          aria-label={`Continue watching ${item.title}`}
        >
          {cardContent}
        </Link>
      ) : (
        <button
          className={mainClass}
          type="button"
          onClick={() => openDetails(item.mediaType, item.id)}
          aria-label={`More information about ${item.title}`}
        >
          {cardContent}
        </button>
      )}
    </article>
  );
}

export function CardSkeleton({ detailed = false }) {
  return (
    <div
      className="overflow-hidden rounded-lg border border-blue-900/60 bg-slate-950 shadow-xl shadow-black/20"
      aria-hidden="true"
    >
      <div className="aspect-[2/3] animate-pulse bg-blue-950/40" />
      {detailed ? (
        <div className="space-y-2 p-3">
          <div className="h-4 w-4/5 animate-pulse rounded bg-blue-950/70" />
          <div className="flex gap-2">
            <div className="h-6 w-12 animate-pulse rounded-full bg-blue-950/60" />
            <div className="h-6 w-10 animate-pulse rounded-full bg-blue-950/50" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-blue-950/50" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MediaGrid({
  items,
  loading = false,
  emptyText = "No titles found.",
  browse = false,
  ghostCount = 0,
}) {
  const classes = browse
    ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6 md:gap-4"
    : "grid auto-cols-[9.5rem] grid-flow-col gap-3 overflow-x-auto pb-2 md:grid-flow-row md:grid-cols-6 md:gap-4 md:overflow-visible md:pb-0";

  if (loading && !items.length) {
    return (
      <div className={classes} aria-busy="true">
        {Array.from({ length: api.PAGE_SIZE }, (_, index) => (
          <CardSkeleton key={`skeleton-${index}`} detailed={browse} />
        ))}
      </div>
    );
  }

  if (!items.length && !ghostCount) {
    return (
      <div className={classes}>
        <p className="col-span-full rounded-lg border border-blue-900/70 bg-blue-950/30 p-7 text-slate-400">
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className={classes} aria-busy={ghostCount > 0} aria-live="polite">
      {items.map((item) => (
        <MediaCard item={item} key={`${item.mediaType}:${item.id}`} />
      ))}
      {Array.from({ length: ghostCount }, (_, index) => (
        <CardSkeleton key={`ghost-${index}`} detailed />
      ))}
    </div>
  );
}
