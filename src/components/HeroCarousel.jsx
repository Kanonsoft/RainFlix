import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { Link } from "react-router";
import { api, imageFallback, watchPath } from "../lib/api.js";
import { backdropImageProps } from "../lib/images.js";
import { useDetails } from "./details/DetailsProvider.jsx";
import TitleArtwork from "./TitleArtwork.jsx";

const SLIDE_DURATION = 8000;
const PEEL_DURATION = 960;
const DRAG_COMMIT_PROGRESS = 0.18;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function interactivePeelStyles(direction, rawProgress, duration = 0) {
  const progress = clamp(rawProgress);
  const incomingBrightness = 0.72 + progress * 0.28;
  const incomingScale = 1.035 - progress * 0.035;
  const outgoingBrightness = 1 - progress * 0.48;
  const outgoingScale = 1 + progress * 0.045;
  const outgoingOffset = progress * (direction === "left" ? -1.5 : 1.5);
  const incomingContentOpacity =
    progress <= 0.58 ? 0 : clamp((progress - 0.58) / 0.27);
  const outgoingContentOpacity = clamp(1 - progress / 0.28);
  const edgeOpacity =
    progress < 0.12
      ? (progress / 0.12) * 0.8
      : progress < 0.82
        ? 0.8 - ((progress - 0.12) / 0.7) * 0.25
        : ((1 - progress) / 0.18) * 0.55;
  const transition = duration
    ? `clip-path ${duration}ms cubic-bezier(0.65, 0, 0.35, 1), filter ${duration}ms cubic-bezier(0.65, 0, 0.35, 1), transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1)`
    : "none";
  const simpleTransition = duration
    ? `opacity ${duration}ms ease, transform ${duration}ms ease`
    : "none";
  const incomingClip =
    direction === "left"
      ? `polygon(${108 - progress * 150}% -2%, 102% -2%, 102% 102%, ${142 - progress * 150}% 102%)`
      : `polygon(-2% -2%, ${-8 + progress * 150}% -2%, ${-42 + progress * 150}% 102%, -2% 102%)`;
  const edgeTranslate =
    direction === "left" ? 610 - progress * 860 : -250 + progress * 860;
  const edgeSkew = direction === "left" ? -12 : 12;

  return {
    incoming: {
      WebkitClipPath: incomingClip,
      clipPath: incomingClip,
      filter: `brightness(${incomingBrightness}) saturate(${0.9 + progress * 0.1})`,
      transform: `scale(${incomingScale})`,
      transition,
    },
    outgoing: {
      filter: `brightness(${outgoingBrightness})`,
      transform: `translateX(${outgoingOffset}%) scale(${outgoingScale})`,
      transition: duration
        ? `filter ${duration}ms cubic-bezier(0.65, 0, 0.35, 1), transform ${duration}ms cubic-bezier(0.65, 0, 0.35, 1)`
        : "none",
    },
    incomingContent: {
      opacity: incomingContentOpacity,
      transform: `translateY(${12 * (1 - incomingContentOpacity)}px)`,
      transition: simpleTransition,
    },
    outgoingContent: {
      opacity: outgoingContentOpacity,
      transform: `translateY(${6 * (1 - outgoingContentOpacity)}px)`,
      transition: simpleTransition,
    },
    edge: {
      opacity: clamp(edgeOpacity),
      transform: `translate3d(${edgeTranslate}%, 0, 0) skewX(${edgeSkew}deg)`,
      transition: simpleTransition,
    },
  };
}

function HeroSlide({
  articleStyle,
  contentStyle,
  item,
  mode,
  direction,
  openDetails,
}) {
  const image = item.backdrop || item.poster || imageFallback(item.title, true);
  const isOutgoing = mode === "outgoing" || mode === "drag-outgoing";
  const isInteractive = !isOutgoing && mode !== "drag-incoming";
  const transitionClass =
    mode === "incoming"
      ? `rainflix-peel-in-${direction}`
      : isOutgoing
        ? mode === "outgoing"
          ? `rainflix-peel-out-${direction}`
          : "rainflix-peel-interactive"
        : mode === "drag-incoming"
          ? "rainflix-peel-interactive"
          : "";
  const contentTransitionClass =
    mode === "incoming"
      ? "rainflix-peel-content-in"
      : mode === "outgoing"
        ? "rainflix-peel-content-out"
        : mode === "drag-incoming" || mode === "drag-outgoing"
          ? "rainflix-peel-content-interactive"
          : "";

  return (
    <article
      className={`absolute inset-0 h-full overflow-hidden ${
        isOutgoing
          ? "z-0 pointer-events-none"
          : isInteractive
            ? "z-10"
            : "z-10 pointer-events-none"
      } ${transitionClass}`}
      aria-hidden={isOutgoing || undefined}
      style={articleStyle}
    >
      <img
        className="absolute inset-0 h-full w-full object-cover opacity-85"
        src={image}
        alt=""
        draggable="false"
        fetchPriority={mode === "active" ? "high" : "auto"}
        {...backdropImageProps(image)}
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.removeAttribute("srcset");
          event.currentTarget.src = imageFallback(item.title, true);
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/80 to-slate-950/20" />
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent" />

      <div
        className={`relative z-10 flex h-full max-w-4xl flex-col justify-end p-5 md:p-8 ${contentTransitionClass}`}
        style={contentStyle}
      >
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
            tabIndex={isInteractive ? undefined : -1}
          >
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            Watch now
          </Link>
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-slate-950/55 px-5 py-3 text-sm font-black text-slate-50 backdrop-blur transition duration-200 hover:border-sky-400/70 hover:bg-slate-950/80 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20 md:px-6"
            type="button"
            onClick={() => openDetails(item.mediaType, item.id)}
            tabIndex={isInteractive ? undefined : -1}
          >
            More info
          </button>
        </div>
      </div>
    </article>
  );
}

export default function HeroCarousel({ items, onBackdrop }) {
  const { openDetails } = useDetails();
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState(null);
  const [direction, setDirection] = useState("left");
  const [dragPreview, setDragPreview] = useState(null);
  const [gestureActive, setGestureActive] = useState(false);
  const [timerVersion, setTimerVersion] = useState(0);
  const pointer = useRef(null);
  const dragSequence = useRef(0);
  const dragSettleTimer = useRef(null);
  const dragFrame = useRef(null);
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
        requestedDirection || (normalized > activeIndex ? "left" : "right"),
      );
      setPreviousIndex(activeIndex);
      setActiveIndex(normalized);
    },
    [activeIndex, itemCount],
  );

  useEffect(() => {
    setActiveIndex(0);
    setPreviousIndex(null);
    setDragPreview(null);
    setGestureActive(false);
    pointer.current = null;
    setDirection("left");
  }, [items]);

  useEffect(() => {
    if (previousIndex === null) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setPreviousIndex(null),
      PEEL_DURATION,
    );
    return () => window.clearTimeout(timer);
  }, [activeIndex, previousIndex]);

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

      if (!document.hidden && !gestureActive && itemCount > 1) {
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
  }, [activeIndex, changeSlide, gestureActive, itemCount, timerVersion]);

  useEffect(
    () => () => {
      window.clearTimeout(dragSettleTimer.current);
      window.cancelAnimationFrame(dragFrame.current);
    },
    [],
  );

  const settleDrag = useCallback((preview, complete) => {
    const destination = complete ? 1 : 0;
    const remaining = complete ? 1 - preview.progress : preview.progress;
    const duration = Math.max(
      complete ? 180 : 140,
      Math.round(PEEL_DURATION * remaining),
    );
    const transitionId = preview.id;

    window.clearTimeout(dragSettleTimer.current);
    window.cancelAnimationFrame(dragFrame.current);
    setDirection(preview.direction);

    if (complete) {
      setActiveIndex(preview.targetIndex);
    }

    setDragPreview({
      ...preview,
      duration,
      phase: complete ? "completing" : "canceling",
    });

    dragFrame.current = window.requestAnimationFrame(() => {
      dragFrame.current = window.requestAnimationFrame(() => {
        setDragPreview((current) =>
          current?.id === transitionId
            ? { ...current, progress: destination }
            : current,
        );
      });
    });

    dragSettleTimer.current = window.setTimeout(() => {
      setDragPreview((current) =>
        current?.id === transitionId ? null : current,
      );
      if (!complete) {
        setTimerVersion((version) => version + 1);
      }
    }, duration + 60);
  }, []);

  const beginGesture = useCallback(
    (event) => {
      if (
        !event.isPrimary ||
        itemCount < 2 ||
        previousIndex !== null ||
        dragPreview !== null ||
        event.target.closest("a, button, input, select, textarea")
      ) {
        return;
      }

      const bounds = event.currentTarget.getBoundingClientRect();
      pointer.current = {
        activeIndex,
        dragging: false,
        height: bounds.height,
        id: event.pointerId,
        startTime: performance.now(),
        startX: event.clientX,
        startY: event.clientY,
        width: bounds.width,
      };
      setGestureActive(true);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [activeIndex, dragPreview, itemCount, previousIndex],
  );

  const moveGesture = useCallback(
    (event) => {
      const gesture = pointer.current;

      if (!gesture || gesture.id !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      const absoluteX = Math.abs(deltaX);
      const absoluteY = Math.abs(deltaY);

      if (!gesture.dragging) {
        if (absoluteX < 8 && absoluteY < 8) {
          return;
        }

        if (absoluteY > absoluteX * 1.1) {
          pointer.current = null;
          setGestureActive(false);
          return;
        }

        gesture.dragging = true;
        gesture.id = event.pointerId;
        gesture.transitionId = ++dragSequence.current;
      }

      event.preventDefault();
      const nextDirection = deltaX < 0 ? "left" : "right";
      const targetIndex =
        (gesture.activeIndex +
          (nextDirection === "left" ? 1 : -1) +
          itemCount) %
        itemCount;
      const progress = clamp(absoluteX / Math.max(1, gesture.width));
      const preview = {
        direction: nextDirection,
        duration: 0,
        fromIndex: gesture.activeIndex,
        id: gesture.transitionId,
        phase: "dragging",
        progress,
        targetIndex,
      };

      gesture.preview = preview;
      setDirection(nextDirection);
      setDragPreview(preview);
    },
    [itemCount],
  );

  const endGesture = useCallback(
    (event) => {
      const gesture = pointer.current;

      if (!gesture || gesture.id !== event.pointerId) {
        return;
      }

      pointer.current = null;
      setGestureActive(false);

      if (!gesture.dragging || !gesture.preview) {
        setTimerVersion((version) => version + 1);
        return;
      }

      const elapsed = Math.max(1, performance.now() - gesture.startTime);
      const velocity = Math.abs(event.clientX - gesture.startX) / elapsed;
      const complete =
        gesture.preview.progress >= DRAG_COMMIT_PROGRESS ||
        (gesture.preview.progress >= 0.06 && velocity >= 0.45);

      settleDrag(gesture.preview, complete);
    },
    [settleDrag],
  );

  const cancelGesture = useCallback(() => {
    const gesture = pointer.current;
    pointer.current = null;
    setGestureActive(false);

    if (gesture?.dragging && gesture.preview) {
      settleDrag(gesture.preview, false);
    } else {
      setTimerVersion((version) => version + 1);
    }
  }, [settleDrag]);

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
  const previousItem =
    previousIndex !== null && previousIndex !== activeIndex
      ? items[previousIndex]
      : null;
  const dragFromItem = dragPreview ? items[dragPreview.fromIndex] : null;
  const dragTargetItem = dragPreview ? items[dragPreview.targetIndex] : null;
  const dragStyles = dragPreview
    ? interactivePeelStyles(
        dragPreview.direction,
        dragPreview.progress,
        dragPreview.phase === "dragging" ? 0 : dragPreview.duration,
      )
    : null;

  return (
    <section
      className={`h-[24rem] touch-pan-y select-none overflow-hidden rounded-xl border border-blue-900/70 bg-blue-950/20 shadow-2xl shadow-black/40 md:h-[28rem] ${
        gestureActive ? "cursor-grabbing" : ""
      }`}
      aria-label="Featured titles"
      onPointerDown={beginGesture}
      onPointerMove={moveGesture}
      onPointerUp={endGesture}
      onPointerCancel={cancelGesture}
    >
      <div className="relative h-full overflow-hidden">
        <div className="absolute left-0 right-0 top-0 z-20 h-1 bg-blue-950/80">
          <div
            className="rainflix-progress h-full bg-sky-400"
            key={`progress-${activeIndex}-${timerVersion}`}
          />
        </div>

        {dragFromItem && dragTargetItem && dragStyles ? (
          <>
            <HeroSlide
              articleStyle={dragStyles.outgoing}
              contentStyle={dragStyles.outgoingContent}
              item={dragFromItem}
              mode="drag-outgoing"
              direction={dragPreview.direction}
              openDetails={openDetails}
              key={`drag-outgoing-${dragPreview.id}-${dragPreview.fromIndex}`}
            />
            <HeroSlide
              articleStyle={dragStyles.incoming}
              contentStyle={dragStyles.incomingContent}
              item={dragTargetItem}
              mode="drag-incoming"
              direction={dragPreview.direction}
              openDetails={openDetails}
              key={`drag-incoming-${dragPreview.id}-${dragPreview.targetIndex}`}
            />
            <span
              className="rainflix-peel-edge"
              style={dragStyles.edge}
              aria-hidden="true"
            />
          </>
        ) : previousItem ? (
          <HeroSlide
            item={previousItem}
            mode="outgoing"
            direction={direction}
            openDetails={openDetails}
            key={`outgoing-${previousItem.mediaType}:${previousItem.id}-${activeIndex}`}
          />
        ) : null}

        {!dragPreview ? (
          <HeroSlide
            item={item}
            mode={previousItem ? "incoming" : "active"}
            direction={direction}
            openDetails={openDetails}
            key={`active-${item.mediaType}:${item.id}-${activeIndex}`}
          />
        ) : null}

        {!dragPreview && previousItem ? (
          <span
            className={`rainflix-peel-edge rainflix-peel-edge-${direction}`}
            aria-hidden="true"
            key={`peel-edge-${activeIndex}-${direction}`}
          />
        ) : null}

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
              disabled={Boolean(dragPreview)}
              aria-label={`Show slide ${index + 1}`}
              key={`${slide.mediaType}:${slide.id}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
