import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router";
import { api, imageFallback, watchPath } from "../lib/api.js";
import { useDetails } from "./details/DetailsProvider.jsx";
import TitleArtwork from "./TitleArtwork.jsx";

const SLIDE_DURATION = 8000;

export default function HeroCarousel({ items, onBackdrop }) {
  const { openDetails } = useDetails();
  const [activeIndex, setActiveIndex] = useState(0);
  const [direction, setDirection] = useState("left");
  const [timerVersion, setTimerVersion] = useState(0);
  const pointer = useRef(null);
  const itemCount = items.length;

  const changeSlide = useCallback(
    (nextIndex, requestedDirection) => {
      if (!itemCount) {
        return;
      }

      const normalized = (nextIndex + itemCount) % itemCount;

      if (normalized === activeIndex) {
        setTimerVersion((version) => version + 1);
        return;
      }

      setDirection(
        requestedDirection ||
          (normalized > activeIndex ? "left" : "right"),
      );
      setActiveIndex(normalized);
    },
    [activeIndex, itemCount],
  );

  useEffect(() => {
    setActiveIndex(0);
    setDirection("left");
  }, [items]);

  useEffect(() => {
    const item = items[activeIndex];

    if (item) {
      onBackdrop?.(
        item.backdrop || item.poster || imageFallback(item.title, true),
      );
    }
  }, [activeIndex, items, onBackdrop]);

  useEffect(() => {
    let timer;
    const schedule = () => {
      window.clearTimeout(timer);

      if (!document.hidden && itemCount > 1) {
        timer = window.setTimeout(
          () => changeSlide(activeIndex + 1, "left"),
          SLIDE_DURATION,
        );
      }
    };
    const handleVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
      } else {
        schedule();
      }
    };

    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [activeIndex, changeSlide, itemCount, timerVersion]);

  if (!items.length) {
    return (
      <section
        className="h-[24rem] overflow-hidden rounded-xl border border-blue-900/70 bg-blue-950/20 shadow-2xl shadow-black/40 md:h-[28rem]"
        aria-label="Featured titles"
      >
        <div className="relative grid h-full place-items-center overflow-hidden">
          <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-blue-950/30 via-sky-500/10 to-blue-950/30" />
        </div>
      </section>
    );
  }

  const item = items[activeIndex] || items[0];
  const image =
    item.backdrop || item.poster || imageFallback(item.title, true);

  return (
    <section
      className="h-[24rem] touch-pan-y select-none overflow-hidden rounded-xl border border-blue-900/70 bg-blue-950/20 shadow-2xl shadow-black/40 md:h-[28rem]"
      aria-label="Featured titles"
      onPointerDown={(event) => {
        if (
          !event.isPrimary ||
          event.target.closest("a, button, input, select, textarea")
        ) {
          return;
        }

        pointer.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }}
      onPointerUp={(event) => {
        if (pointer.current?.id !== event.pointerId) {
          return;
        }

        const deltaX = event.clientX - pointer.current.x;
        const deltaY = event.clientY - pointer.current.y;
        pointer.current = null;

        if (
          Math.abs(deltaX) > 48 &&
          Math.abs(deltaX) > Math.abs(deltaY) * 1.15
        ) {
          changeSlide(
            activeIndex + (deltaX < 0 ? 1 : -1),
            deltaX < 0 ? "left" : "right",
          );
        } else {
          setTimerVersion((version) => version + 1);
        }
      }}
      onPointerCancel={() => {
        pointer.current = null;
        setTimerVersion((version) => version + 1);
      }}
    >
      <div className="relative h-full overflow-hidden">
        <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-blue-950/80">
          <div
            className="rainflix-progress h-full bg-sky-400"
            key={`progress-${activeIndex}-${timerVersion}`}
          />
        </div>

        <article
          className={`absolute inset-0 h-full overflow-hidden ${
            direction === "left" ? "rainflix-next-left" : "rainflix-next-right"
          }`}
          key={`${item.mediaType}:${item.id}:${activeIndex}`}
        >
          <img
            className="absolute inset-0 h-full w-full object-cover opacity-85"
            src={image}
            alt=""
            draggable="false"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = imageFallback(item.title, true);
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/20" />
          <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent" />

          <div className="relative z-10 flex h-full max-w-4xl flex-col justify-end p-5 md:p-8">
            <div className="mb-4 flex items-center gap-3 text-sm text-slate-300">
              <span className="rounded-full bg-sky-400/15 px-3 py-1 font-black uppercase text-sky-300">
                {api.mediaLabel(item.mediaType)}
              </span>
              <span>{item.year}</span>
              <span className="rounded-full bg-blue-500/20 px-3 py-1 font-black text-sky-200">
                {item.rating}
              </span>
            </div>

            <h2 className="max-w-3xl leading-none text-slate-50">
              <TitleArtwork
                logo={item.logo}
                title={item.title}
                imageClassName="title-logo max-h-20 w-auto max-w-[min(28rem,78vw)] object-contain object-left md:max-h-28"
                fallbackClassName="text-4xl font-black md:text-6xl"
              />
            </h2>

            <p className="mt-4 line-clamp-3 max-w-2xl text-sm leading-6 text-slate-300 md:mt-5 md:line-clamp-4 md:text-base md:leading-7">
              {item.synopsis}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 shadow-xl shadow-sky-500/20 transition duration-200 hover:bg-sky-300 focus-visible:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25 md:px-6"
                to={watchPath(item)}
              >
                <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
                Watch now
              </Link>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-slate-950/55 px-5 py-3 text-sm font-black text-slate-50 backdrop-blur transition duration-200 hover:border-sky-400/70 hover:bg-slate-950/80 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20 md:px-6"
                type="button"
                onClick={() => openDetails(item.mediaType, item.id)}
              >
                More info
              </button>
            </div>
          </div>
        </article>

        <div className="absolute left-5 top-6 z-30 flex gap-2 md:left-8 md:top-8">
          {items.map((slide, index) => (
            <button
              className={`h-2.5 rounded-full transition ${
                index === activeIndex
                  ? "w-9 bg-sky-400"
                  : "w-2.5 bg-slate-500/70 hover:bg-slate-300"
              }`}
              type="button"
              onClick={() => changeSlide(index)}
              aria-label={`Show slide ${index + 1}`}
              key={`${slide.mediaType}:${slide.id}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
