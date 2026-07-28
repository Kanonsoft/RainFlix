import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Play, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { api, imageFallback, watchPath } from "../../lib/api.js";
import TitleArtwork from "../TitleArtwork.jsx";

const DetailsContext = createContext(null);
const MODAL_HISTORY_KEY = "rainflixDetailsModal";
const PREVIEW_QUERY_KEY = "preview";

function previewFromSearch(search = "") {
  const value = new URLSearchParams(search).get(PREVIEW_QUERY_KEY) || "";
  const match = /^(movie|tv)-(\d+)$/.exec(value);

  if (!match) {
    return null;
  }

  return {
    id: match[2],
    mediaType: match[1],
  };
}

function searchWithPreview(search, mediaType, id) {
  const params = new URLSearchParams(search);
  params.set(PREVIEW_QUERY_KEY, `${mediaType}-${id}`);
  return `?${params.toString()}`;
}

function searchWithoutPreview(search) {
  const params = new URLSearchParams(search);
  params.delete(PREVIEW_QUERY_KEY);
  const value = params.toString();
  return value ? `?${value}` : "";
}

function stateWithoutModal(state) {
  const nextState =
    state && typeof state === "object" ? { ...state } : {};
  delete nextState[MODAL_HISTORY_KEY];
  return nextState;
}

function formatDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return value || "Not announced";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function trailerUrl(trailerKey) {
  const params = new URLSearchParams({
    autoplay: "1",
    controls: "1",
    mute: "0",
    playsinline: "1",
    rel: "0",
  });

  return `https://www.youtube-nocookie.com/embed/${trailerKey}?${params}`;
}

function DetailsSkeleton() {
  return (
    <>
      <h2 id="titleDetailsHeading" className="sr-only">
        Loading title details
      </h2>
      <div className="h-64 animate-pulse bg-blue-950/50 md:h-80" />
      <div className="space-y-5 p-5 md:p-7">
        <div className="h-7 w-2/3 animate-pulse bg-blue-950/60" />
        <div className="h-4 w-1/2 animate-pulse bg-blue-950/45" />
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse bg-blue-950/35" />
          <div className="h-4 w-11/12 animate-pulse bg-blue-950/35" />
          <div className="h-4 w-4/5 animate-pulse bg-blue-950/35" />
        </div>
      </div>
    </>
  );
}

function CastMember({ person }) {
  return (
    <figure className="w-24 shrink-0">
      <div className="overflow-hidden rounded-lg bg-slate-950">
        {person.image ? (
          <img
            className="aspect-[2/3] w-full object-cover"
            src={person.image}
            alt={`${person.name} portrait`}
            loading="lazy"
            decoding="async"
            draggable="false"
          />
        ) : (
          <div className="grid aspect-[2/3] w-full place-items-center bg-blue-950/55 px-2 text-center text-xs font-bold text-slate-400">
            {person.name}
          </div>
        )}
      </div>
      <figcaption className="mt-2">
        <span className="line-clamp-2 block text-xs font-bold leading-4 text-slate-100">
          {person.name}
        </span>
        {person.character ? (
          <span className="mt-1 line-clamp-2 block text-[0.7rem] leading-4 text-slate-500">
            {person.character}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

function DetailsContent({ details, onWatch }) {
  const [trailerActive, setTrailerActive] = useState(false);
  const backdrop =
    details.backdrop ||
    details.poster ||
    imageFallback(details.title, true);
  const genres = details.genres || [];
  const cast = details.cast || [];
  const trailerKey = /^[A-Za-z0-9_-]+$/.test(details.trailerKey || "")
    ? details.trailerKey
    : "";
  const runtime = details.duration || details.runtime || "Not available";

  useEffect(() => setTrailerActive(false), [details.id, details.mediaType]);

  return (
    <article>
      <div className="relative h-64 overflow-hidden bg-slate-950 md:h-80">
        <div className="absolute inset-0" id="detailsTrailerStage">
          <img
            className="absolute inset-0 h-full w-full object-cover opacity-80"
            src={backdrop}
            alt=""
            decoding="async"
            draggable="false"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = imageFallback(details.title, true);
            }}
          />
          {trailerActive ? (
            <iframe
              className="absolute inset-0 h-full w-full bg-black"
              src={trailerUrl(trailerKey)}
              title="Official trailer"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              frameBorder="0"
            />
          ) : null}
        </div>
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/58 to-slate-950/15 transition duration-700 ${
            trailerActive ? "opacity-0" : ""
          }`}
        />
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-slate-950 to-transparent transition duration-700 ${
            trailerActive ? "opacity-0" : ""
          }`}
        />

        <div
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 p-5 pr-16 transition duration-700 md:p-7 md:pr-20 ${
            trailerActive ? "opacity-0" : ""
          }`}
        >
          <p className="mb-3 text-xs font-black uppercase text-sky-300">
            {api.mediaLabel(details.mediaType)}
          </p>
          <h2 id="titleDetailsHeading" className="max-w-3xl leading-tight text-slate-50">
            <TitleArtwork
              logo={details.logo}
              title={details.title}
              imageClassName="title-logo max-h-20 w-auto max-w-[min(30rem,76vw)] object-contain object-left md:max-h-24"
              fallbackClassName="text-3xl font-black md:text-5xl"
            />
          </h2>
          {details.tagline ? (
            <p className="mt-3 max-w-2xl text-sm italic text-slate-300 md:text-base">
              {details.tagline}
            </p>
          ) : null}
        </div>
      </div>

      <div className="p-5 md:p-7">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 transition duration-200 hover:bg-sky-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/25"
            type="button"
            onClick={onWatch}
          >
            <Play className="h-4 w-4" fill="currentColor" aria-hidden="true" />
            Watch now
          </button>
          {trailerKey ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-blue-800/80 bg-blue-950/45 px-5 py-3 text-sm font-black text-slate-100 transition duration-200 hover:border-sky-500 hover:text-sky-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-400/20"
              type="button"
              onClick={() => setTrailerActive(true)}
              aria-pressed={trailerActive}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {trailerActive ? "Restart trailer" : "Play trailer"}
            </button>
          ) : null}
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-x-5 gap-y-4 border-y border-blue-950/80 py-5 sm:grid-cols-4">
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">
              Release date
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-100">
              {formatDate(details.releaseDate)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">
              Runtime
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-100">
              {runtime}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">
              Status
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-100">
              {details.status || "Not available"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase text-slate-500">
              Rating
            </dt>
            <dd className="mt-1 text-sm font-bold text-slate-100">
              {details.rating} / 10
            </dd>
          </div>
        </dl>

        <section className="mt-6" aria-labelledby="detailsSynopsisTitle">
          <h3
            id="detailsSynopsisTitle"
            className="text-lg font-black text-slate-50"
          >
            Synopsis
          </h3>
          <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-300 md:text-base">
            {details.synopsis}
          </p>
        </section>

        {genres.length ? (
          <section className="mt-6" aria-labelledby="detailsGenresTitle">
            <h3
              id="detailsGenresTitle"
              className="text-lg font-black text-slate-50"
            >
              Genres
            </h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <span
                  className="rounded-full border border-blue-800/70 px-3 py-1 text-xs font-bold text-sky-200"
                  key={genre}
                >
                  {genre}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {cast.length ? (
          <section className="mt-7" aria-labelledby="detailsCastTitle">
            <h3
              id="detailsCastTitle"
              className="text-lg font-black text-slate-50"
            >
              Cast
            </h3>
            <div className="mt-4 flex gap-4 overflow-x-auto pb-3">
              {cast.map((person) => (
                <CastMember person={person} key={person.id || person.name} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </article>
  );
}

export function DetailsProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [modal, setModal] = useState({
    details: null,
    error: false,
    loading: false,
    open: false,
  });
  const activeRequest = useRef(0);
  const dialogRef = useRef(null);
  const modalOpenRef = useRef(false);
  const returnFocus = useRef(null);
  const closeImmediately = useCallback((restoreFocus = true) => {
    activeRequest.current += 1;
    modalOpenRef.current = false;
    setModal((current) => ({ ...current, open: false }));
    document.documentElement.classList.remove("details-modal-open");

    if (restoreFocus) {
      window.setTimeout(() => {
        const candidate = returnFocus.current;
        const fallback = document.querySelector("#app-view");
        const target =
          candidate instanceof HTMLElement &&
          candidate.getClientRects().length &&
          !candidate.closest('[aria-hidden="true"]')
            ? candidate
            : fallback;
        target?.focus({ preventScroll: true });
      }, 0);
    }

    returnFocus.current = null;
  }, []);

  const loadDetails = useCallback(async (mediaType, id) => {
    if (!mediaType || !String(id || "").trim()) {
      return;
    }

    const requestId = ++activeRequest.current;
    const wasOpen = modalOpenRef.current;

    if (!wasOpen) {
      returnFocus.current ||= document.activeElement;
    }

    setModal({
      details: null,
      error: false,
      loading: true,
      open: true,
    });
    modalOpenRef.current = true;
    document.documentElement.classList.add("details-modal-open");

    try {
      const details = await api.getDetails(mediaType, id);

      if (requestId !== activeRequest.current) {
        return;
      }

      setModal({
        details,
        error: !details,
        loading: false,
        open: true,
      });
    } catch {
      if (requestId === activeRequest.current) {
        setModal({
          details: null,
          error: true,
          loading: false,
          open: true,
        });
      }
    }
  }, []);

  const openDetails = useCallback(
    (mediaType, id) => {
      const normalizedType = api.normalizeMediaType(mediaType);
      const normalizedId = String(id || "").trim();

      if (
        !["movie", "tv"].includes(normalizedType) ||
        !/^\d+$/.test(normalizedId)
      ) {
        return;
      }

      const currentPreview = previewFromSearch(location.search);

      if (
        currentPreview?.mediaType === normalizedType &&
        currentPreview.id === normalizedId
      ) {
        if (!modalOpenRef.current) {
          loadDetails(normalizedType, normalizedId);
        }
        return;
      }

      if (!modalOpenRef.current) {
        returnFocus.current = document.activeElement;
      }

      navigate(
        {
          pathname: location.pathname,
          search: searchWithPreview(
            location.search,
            normalizedType,
            normalizedId,
          ),
          hash: location.hash,
        },
        {
          replace: Boolean(currentPreview),
          state: {
            ...stateWithoutModal(location.state),
            [MODAL_HISTORY_KEY]: true,
          },
        },
      );
    },
    [
      loadDetails,
      location.hash,
      location.pathname,
      location.search,
      location.state,
      navigate,
    ],
  );

  const closeDetails = useCallback((restoreFocus = true) => {
    if (!modalOpenRef.current) {
      return;
    }

    if (previewFromSearch(location.search)) {
      if (location.state?.[MODAL_HISTORY_KEY]) {
        navigate(-1);
      } else {
        navigate(
          {
            pathname: location.pathname,
            search: searchWithoutPreview(location.search),
            hash: location.hash,
          },
          {
            replace: true,
            state: stateWithoutModal(location.state),
          },
        );
      }
    } else {
      closeImmediately(restoreFocus);
    }
  }, [
    closeImmediately,
    location.hash,
    location.pathname,
    location.search,
    location.state,
    navigate,
  ]);

  useEffect(() => {
    const preview = previewFromSearch(location.search);

    if (preview) {
      loadDetails(preview.mediaType, preview.id);
    } else if (modalOpenRef.current) {
      closeImmediately(true);
    }
  }, [
    closeImmediately,
    loadDetails,
    location.pathname,
    location.search,
  ]);

  useEffect(() => {
    if (!modal.open) {
      return undefined;
    }

    window.setTimeout(
      () => dialogRef.current?.querySelector("[data-details-close]")?.focus(),
      80,
    );

    const handleKeyDown = (event) => {
      const editable = event.target.matches?.(
        'input, textarea, select, [contenteditable="true"]',
      );
      const backKey =
        ["Escape", "BrowserBack", "GoBack"].includes(event.key) ||
        [27, 461, 10009].includes(event.keyCode) ||
        (event.key === "Backspace" && !editable);

      if (backKey) {
        event.preventDefault();
        event.stopPropagation();
        closeDetails();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusable = [
        ...dialogRef.current.querySelectorAll(
          'a[href], button:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);

      if (!first || !last) {
        event.preventDefault();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [closeDetails, modal.open]);

  const handleWatch = useCallback(() => {
    if (!modal.details) {
      return;
    }

    const target = watchPath(modal.details);
    closeImmediately(false);
    navigate(target, {
      replace: Boolean(previewFromSearch(location.search)),
      state: stateWithoutModal(location.state),
    });
  }, [
    closeImmediately,
    location.search,
    location.state,
    modal.details,
    navigate,
  ]);

  const value = useMemo(
    () => ({ closeDetails, openDetails }),
    [closeDetails, openDetails],
  );

  return (
    <DetailsContext.Provider value={value}>
      {children}
      <div
        id="titleDetailsModal"
        className={`title-details-modal${modal.open ? " is-open" : ""}`}
        aria-hidden={!modal.open}
      >
        <button
          className="title-details-backdrop"
          type="button"
          onClick={() => closeDetails()}
          aria-label="Close title details"
          tabIndex={modal.open ? 0 : -1}
        />
        <section
          className="title-details-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titleDetailsHeading"
          ref={dialogRef}
        >
          <button
            className="title-details-close"
            type="button"
            data-details-close
            onClick={() => closeDetails()}
            aria-label="Close title details"
            title="Close"
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          {modal.loading ? <DetailsSkeleton /> : null}
          {modal.error ? (
            <div className="grid min-h-[22rem] place-items-center p-7 text-center">
              <div>
                <h2
                  id="titleDetailsHeading"
                  className="text-2xl font-black text-slate-50"
                >
                  Details unavailable
                </h2>
                <p className="mt-3 text-sm text-slate-400">
                  RainFlix could not load this title&apos;s information right now.
                </p>
              </div>
            </div>
          ) : null}
          {modal.details ? (
            <DetailsContent details={modal.details} onWatch={handleWatch} />
          ) : null}
        </section>
      </div>
    </DetailsContext.Provider>
  );
}

export function useDetails() {
  const context = useContext(DetailsContext);

  if (!context) {
    throw new Error("useDetails must be used inside DetailsProvider.");
  }

  return context;
}
