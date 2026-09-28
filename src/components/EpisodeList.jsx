import { useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Film, Search } from "lucide-react";

const seasonButtonClass =
  "inline-flex h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-30";
const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function releaseLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : dateFormat.format(date);
}

function EpisodeImage({ video }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="relative grid aspect-video w-24 shrink-0 place-items-center overflow-hidden rounded bg-white/5 sm:w-32">
      {video.image && !failed ? (
        <img
          src={video.image}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <Film className="h-6 w-6 text-slate-500" aria-hidden="true" />
      )}
    </span>
  );
}

export default function EpisodeList({
  videos,
  seasons,
  season,
  selectedVideo,
  isSeries,
  onSeasonChange,
  onVideoChange,
}) {
  const [query, setQuery] = useState("");
  const list = useRef(null);
  const selected = useRef(null);
  const seasonIndex = seasons.indexOf(season);
  const label = isSeries ? "Episodes" : "Videos";
  const filtered = videos.filter((video) =>
    `${video.episode ?? ""} ${video.title}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const viewport = list.current;
    const button = selected.current;
    if (!viewport || !button) return;
    const bounds = viewport.getBoundingClientRect();
    const item = button.getBoundingClientRect();
    if (item.top < bounds.top || item.bottom > bounds.bottom)
      viewport.scrollTop += item.top - bounds.top;
  }, [selectedVideo?.id, query]);

  return (
    <section className="mt-8 min-w-0" aria-label={label}>
      <h2 className="mb-3 text-lg font-bold">{label}</h2>
      <div className="flex max-h-[min(36rem,70svh)] min-h-0 flex-col rounded-lg border border-white/10 bg-black/30 p-3 sm:p-4">
        {seasons.length > 0 && (
          <div className="mb-3 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
            <button
              type="button"
              className={seasonButtonClass}
              aria-label="Previous season"
              disabled={seasonIndex <= 0}
              onClick={() => onSeasonChange(seasons[seasonIndex - 1])}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              Prev
            </button>
            <select
              aria-label="Season"
              value={season}
              className="h-11 w-full min-w-0 max-w-full truncate rounded-lg border-0 bg-transparent px-2 text-center text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-sky-400 [&>option]:bg-slate-950"
              onChange={(event) => onSeasonChange(Number(event.target.value))}
            >
              {seasons.map((value) => (
                <option key={value} value={value}>
                  Season {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={seasonButtonClass}
              aria-label="Next season"
              disabled={seasonIndex < 0 || seasonIndex === seasons.length - 1}
              onClick={() => onSeasonChange(seasons[seasonIndex + 1])}
            >
              Next
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <label className="relative mb-3 block shrink-0">
          <span className="sr-only">Search {label.toLowerCase()}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${label.toLowerCase()}`}
            className="h-11 w-full min-w-0 rounded-lg border border-white/10 bg-white/5 pl-10 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
          />
          <Search className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" aria-hidden="true" />
        </label>
        <div
          ref={list}
          className="min-h-0 overflow-y-auto overscroll-y-contain pr-1 [scrollbar-gutter:stable]"
          data-episode-list
        >
          {filtered.length ? (
            <ul className="grid gap-2">
              {filtered.map((video) => {
                const active = video.id === selectedVideo?.id;
                const date = releaseLabel(video.releaseDate);
                return (
                  <li key={video.id}>
                    <button
                      ref={active ? selected : undefined}
                      type="button"
                      data-video-id={video.id}
                      aria-label={`${video.episode != null ? `${video.episode}. ` : ""}${video.title}`}
                      aria-pressed={active}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-lg border p-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 ${active ? "border-sky-400/40 bg-sky-400/10" : "border-transparent hover:bg-white/5"}`}
                      onClick={() => onVideoChange(video.id)}
                    >
                      <EpisodeImage video={video} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium leading-5 sm:text-base">
                          {video.episode != null ? `${video.episode}. ` : ""}
                          {video.title}
                        </span>
                        {date && <time dateTime={video.releaseDate} className="mt-2 block text-xs text-slate-400">{date}</time>}
                      </span>
                      {active && <Check className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p role="status" className="py-8 text-center text-sm text-slate-400">
              {query ? `No matching ${label.toLowerCase()}.` : `No ${label.toLowerCase()} available.`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
