import { useEffect, useMemo, useRef, useState } from "react";
import rainflixLogo from "../../assets/rainflix-r.png";
import { config } from "../lib/api.js";

const COLUMN_COUNT = 7;
const CARDS_PER_COLUMN = 5;

function LoaderCard({ poster, onSettled }) {
  return (
    <div className="app-loader-card">
      <img
        src={poster}
        alt=""
        loading="eager"
        decoding="async"
        draggable="false"
        onLoad={onSettled}
        onError={onSettled}
      />
    </div>
  );
}

export default function AppLoader({ dataReady, posters }) {
  const shownAt = useRef(performance.now());
  const [visible, setVisible] = useState(true);
  const [wallReady, setWallReady] = useState(false);
  const [settledImages, setSettledImages] = useState(0);
  const minimumDuration = Math.max(
    1200,
    Number(config?.appReadyMinimumMs) || 2400,
  );
  const fallbackDuration = Math.max(
    3000,
    Number(config?.appReadyTimeoutMs) || 3500,
  );
  const uniquePosters = useMemo(
    () => [...new Set((posters || []).filter(Boolean))].slice(0, 35),
    [posters],
  );
  const expectedImages = uniquePosters.length ? COLUMN_COUNT * CARDS_PER_COLUMN : 0;

  useEffect(() => {
    document.documentElement.classList.toggle("app-is-loading", visible);

    return () => document.documentElement.classList.remove("app-is-loading");
  }, [visible]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(
      () => setVisible(false),
      fallbackDuration,
    );

    return () => window.clearTimeout(fallbackTimer);
  }, [fallbackDuration]);

  useEffect(() => {
    if (!dataReady) {
      return undefined;
    }

    const elapsed = performance.now() - shownAt.current;
    const timer = window.setTimeout(
      () => setVisible(false),
      Math.max(0, minimumDuration - elapsed),
    );
    return () => window.clearTimeout(timer);
  }, [dataReady, minimumDuration]);

  useEffect(() => {
    setSettledImages(0);
    setWallReady(false);
    const timer = window.setTimeout(() => setWallReady(true), 900);
    return () => window.clearTimeout(timer);
  }, [uniquePosters]);

  useEffect(() => {
    if (expectedImages && settledImages >= expectedImages) {
      setWallReady(true);
    }
  }, [expectedImages, settledImages]);

  const columns = useMemo(() => {
    if (!uniquePosters.length) {
      return [];
    }

    return Array.from({ length: COLUMN_COUNT }, (_, columnIndex) =>
      Array.from({ length: CARDS_PER_COLUMN }, (_, cardIndex) => {
        const posterIndex =
          (columnIndex * CARDS_PER_COLUMN + cardIndex * 3) %
          uniquePosters.length;
        return uniquePosters[posterIndex];
      }),
    );
  }, [uniquePosters]);

  return (
    <div
      id="appLoader"
      className={`app-loader${visible ? "" : " is-hidden"}`}
      role="status"
      aria-live="polite"
      aria-hidden={!visible}
    >
      <div className="app-loader-scene" aria-hidden="true">
        <div className={`app-loader-wall${wallReady ? " is-ready" : ""}`}>
          {columns.map((column, columnIndex) => (
            <div
              className={`app-loader-column app-loader-column-${
                columnIndex % 2 === 0 ? "up" : "down"
              }`}
              key={`loader-column-${columnIndex}`}
            >
              <div className="app-loader-column-track">
                {[false, true].map((duplicate) => (
                  <div
                    className="app-loader-sequence"
                    aria-hidden={duplicate || undefined}
                    key={duplicate ? "duplicate" : "primary"}
                  >
                    {column.map((poster, cardIndex) => (
                      <LoaderCard
                        poster={poster}
                        key={`${duplicate ? "d" : "p"}-${cardIndex}-${poster}`}
                        onSettled={() => setSettledImages((count) => count + 1)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="app-loader-vignette" aria-hidden="true" />
      <div className="app-loader-content">
        <div className="app-loader-emblem">
          <img
            className="app-loader-logo"
            src={rainflixLogo}
            alt=""
            draggable="false"
          />
        </div>
        <div className="app-loader-track" aria-hidden="true">
          <div className="app-loader-bar" />
        </div>
        <span className="sr-only">Loading RainFlix</span>
      </div>
    </div>
  );
}
