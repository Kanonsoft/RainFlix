import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Layers, MonitorPlay, Bookmark } from "lucide-react";
import wordmark from "../../assets/rainflix-wordmark.png";
import brandLogo from "../../assets/rainflix-r.png";
import { usePageMetadata } from "../lib/metadata.js";
import { api, watchPath } from "../lib/api.js";
import "./landing.css";

function TrendingStrip({ items }) {
  if (!items.length) return null;
  const tiles = Array.from(
    { length: Math.ceil(12 / items.length) },
    () => items,
  ).flat();
  return (
    <section className="landing-trending" aria-label="Trending this week">
      <div
        className="landing-trending-track"
        style={{ "--strip-duration": `${Math.max(60, items.length * 8)}s` }}
      >
        {[false, true].map((duplicate) => (
          <div
            className="landing-trending-group"
            key={String(duplicate)}
            aria-hidden={duplicate || undefined}
          >
            {tiles.map((item, index) => (
              <Link
                className="landing-title"
                key={`${item.mediaType}:${item.id}:${index}`}
                to={watchPath(item)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={item.title}
                aria-hidden={index >= items.length || undefined}
                tabIndex={duplicate || index >= items.length ? -1 : undefined}
              >
                <img
                  className="landing-title-thumbnail"
                  src={item.backdrop || item.poster}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
                <img
                  className="landing-title-logo"
                  src={item.logo || brandLogo}
                  alt=""
                  draggable={false}
                  decoding="async"
                  onError={(event) => {
                    if (event.currentTarget.dataset.fallback) return;
                    event.currentTarget.dataset.fallback = "true";
                    event.currentTarget.src = brandLogo;
                  }}
                />
              </Link>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

export default function LandingPage() {
  const [backdrop, setBackdrop] = useState("");
  const [trending, setTrending] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api
      .getTrendingThisWeek(12)
      .then(async (feed) => {
        const items = feed.items.filter((item) => item.backdrop || item.poster);
        if (cancelled) return;
        setTrending(items);
        api
          .getTitleLogos(items)
          .then((withLogos) => {
            if (!cancelled) setTrending(withLogos);
          })
          .catch(() => {});
        const url = items[0]?.backdrop || items[0]?.poster;
        if (!url) return;
        const image = new Image();
        image.src = url;
        await image.decode().catch(() => {});
        if (!cancelled) setBackdrop(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  usePageMetadata({
    title: "RainFlix",
    description:
      "Your next watch, all in one place. Explore films and series with RainFlix.",
  });
  return (
    <div className="landing">
      {backdrop && (
        <img className="landing-movie-backdrop" src={backdrop} alt="" />
      )}
      <nav className="landing-nav" aria-label="RainFlix introduction">
        <Link to="/" aria-label="RainFlix">
          <img src={wordmark} alt="RainFlix" />
        </Link>
      </nav>
      <section className="landing-hero">
        <div className="landing-copy">
          <p className="landing-eyebrow">YOUR NEXT WATCH STARTS HERE</p>
          <h1>RainFlix</h1>
          <p className="landing-description">
            A home for your movies, series, and everything you want to watch
            next.
          </p>
          <div className="landing-actions">
            <Link
              className="landing-download"
              to="/downloads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download RainFlix
            </Link>
            <Link
              className="landing-open"
              to="/home"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open RainFlix on web
            </Link>
          </div>
        </div>
      </section>
      <section className="landing-features">
        <div>
          <span className="landing-eyebrow">ONE PLACE. YOUR WAY.</span>
          <h2>
            Less searching.
            <br />
            More discovering.
          </h2>
        </div>
        <div className="landing-feature">
          <Layers />
          <h3>Find your next favorite</h3>
          <p>
            Browse movies and series by genre and year, explore cast credits,
            and discover related titles.
          </p>
        </div>
        <div className="landing-feature">
          <MonitorPlay />
          <h3>Make it yours</h3>
          <p>
            Native playback, subtitles, and optional add-ons in the desktop and
            Android apps.
          </p>
        </div>
        <div className="landing-feature">
          <Bookmark />
          <h3>Pick up where you left off</h3>
          <p>
            Keep a watchlist and return to your viewing progress on your device.
          </p>
        </div>
      </section>
      <TrendingStrip items={trending} />
      <section className="landing-bottom">
        <h2>
          A little less scrolling.
          <br />A little more watching.
        </h2>
        <Link
          className="landing-download"
          to="/downloads"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get RainFlix
        </Link>
      </section>
    </div>
  );
}
