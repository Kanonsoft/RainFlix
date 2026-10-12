import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Layers,
  MonitorPlay,
  Volume2,
  VolumeX,
} from "lucide-react";
import wordmark from "../../assets/rainflix-wordmark.png";
import brandLogo from "../../assets/rainflix-r.png";
import { usePageMetadata } from "../lib/metadata.js";
import { api, watchPath } from "../lib/api.js";
import TitleArtwork from "../components/TitleArtwork.jsx";
import "./landing.css";

function command(frame, name, args = []) {
  frame?.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: name, args }),
    "https://www.youtube-nocookie.com",
  );
}

function Trailer({ movie }) {
  const foreground = useRef(null);
  const background = useRef(null);
  const surface = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [ambient, setAmbient] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const key = movie.trailerKey;
  useEffect(() => {
    if (!key) return;
    let fade;
    let started = false;
    let synced = 0;
    const receive = (event) => {
      if (
        event.origin !== "https://www.youtube-nocookie.com" ||
        event.source !== foreground.current?.contentWindow
      )
        return;
      let data;
      try {
        data =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      const state =
        data?.event === "onStateChange" ? data.info : data?.info?.playerState;
      if (state === 1) {
        clearInterval(handshake);
        setPlaying(true);
        if (!started) {
          started = true;
          setAmbient(true);
          command(background.current, "playVideo");
          fade = setTimeout(() => {
            setAmbient(false);
            command(background.current, "pauseVideo");
          }, 14000);
        }
      } else if (state === 0) {
        setPlaying(false);
        setAmbient(false);
      }
      if (data?.event === "onError") {
        clearInterval(handshake);
        setFailed(true);
        setAmbient(false);
      }
      const time = data?.info?.currentTime;
      if (Number.isFinite(time) && Math.abs(time - synced) > 4) {
        synced = time;
        command(background.current, "seekTo", [time, true]);
      }
    };
    window.addEventListener("message", receive);
    const handshake = setInterval(() => {
      foreground.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: "landing-trailer" }),
        "https://www.youtube-nocookie.com",
      );
      command(foreground.current, "addEventListener", ["onStateChange"]);
      command(foreground.current, "addEventListener", ["onError"]);
    }, 500);
    const timer = setTimeout(() => setAmbient(false), 22000);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          command(foreground.current, "pauseVideo");
          command(background.current, "pauseVideo");
          setAmbient(false);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(surface.current);
    return () => {
      clearTimeout(fade);
      clearTimeout(timer);
      clearInterval(handshake);
      observer.disconnect();
      window.removeEventListener("message", receive);
    };
  }, [key]);
  const connect = (frame) => {
    const target = frame.current;
    target?.contentWindow?.postMessage(
      JSON.stringify({ event: "listening", id: "landing-trailer" }),
      "https://www.youtube-nocookie.com",
    );
    command(target, "addEventListener", ["onStateChange"]);
    command(target, "addEventListener", ["onError"]);
    command(target, "mute");
    command(target, "playVideo");
  };
  const embed = key
    ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(key)}?autoplay=1&mute=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}&rel=0`
    : "";
  return (
    <>
      <div
        className={`landing-ambient-video${ambient ? " is-playing" : ""}`}
        aria-hidden="true"
      >
        {key && !failed && (
          <iframe
            ref={background}
            src={`${embed}&controls=0&disablekb=1`}
            title="Decorative trailer background"
            tabIndex={-1}
            allow="autoplay; encrypted-media"
            onLoad={() => connect(background)}
          />
        )}
      </div>
      <section
        ref={surface}
        id="landing-trailers"
        className="landing-hero"
        aria-label="Trailers"
      >
        <div className="landing-trailer-frame">
          <div className="landing-trailer-media">
            <img
              className={`landing-trailer-poster${playing && !failed ? " is-playing" : ""}`}
              src={movie.backdrop || movie.poster}
              alt={`${movie.title} trailer artwork`}
              draggable={false}
            />
            {key && !failed && (
              <iframe
                ref={foreground}
                src={`${embed}&controls=1`}
                title={`${movie.title} trailer`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                onLoad={() => connect(foreground)}
              />
            )}
            {key && !failed && !playing && (
              <button
                className="landing-trailer-play"
                onClick={() => {
                  connect(foreground);
                  command(foreground.current, "playVideo");
                }}
              >
                Play trailer
              </button>
            )}
            {!key || failed ? (
              <span className="landing-trailer-unavailable">
                {failed ? "Trailer unavailable" : "Featured this week"}
              </span>
            ) : (
              <button
                className="landing-sound"
                aria-label={
                  muted ? "Enable trailer sound" : "Mute trailer sound"
                }
                title={muted ? "Enable trailer sound" : "Mute trailer sound"}
                onClick={() => {
                  command(foreground.current, muted ? "unMute" : "mute");
                  setMuted(!muted);
                }}
              >
                {muted ? (
                  <VolumeX aria-hidden="true" />
                ) : (
                  <Volume2 aria-hidden="true" />
                )}
              </button>
            )}
          </div>
        </div>
        <div className="landing-feature-brand">
          <h1 id="landing-movie-title">
            <TitleArtwork logo={movie.logo} title={movie.title} />
          </h1>
          <div className="landing-actions">
            <Link
              className="landing-download"
              to="/downloads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Download RainFlix
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function TrendingStrip({
  items,
  title,
  description,
  loading = false,
  direction = -1,
}) {
  const viewport = useRef(null);
  const group = useRef(null);
  const pauseUntil = useRef(0);
  const drag = useRef(null);
  const suppressClick = useRef(false);
  const tiles = items.length
    ? Array.from({ length: Math.ceil(12 / items.length) }, () => items).flat()
    : [];
  useEffect(() => {
    if (!items.length) return;
    const element = viewport.current;
    let width = 0;
    let frame;
    let previous = 0;
    let remainder = 0;
    let visible = false;
    const measure = () => {
      width = group.current.getBoundingClientRect().width;
      element.scrollLeft = width;
    };
    const resize = new ResizeObserver(measure);
    resize.observe(group.current);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(element);
    const tick = (now) => {
      const elapsed = previous ? Math.min(now - previous, 64) : 0;
      previous = now;
      if (
        visible &&
        !document.hidden &&
        !drag.current &&
        now > pauseUntil.current
      ) {
        remainder += elapsed * 0.018;
        const pixels = Math.floor(remainder);
        remainder -= pixels;
        element.scrollLeft += pixels * direction;
      }
      if (width && element.scrollLeft >= width * 2) element.scrollLeft -= width;
      else if (width && element.scrollLeft < width * 0.5)
        element.scrollLeft += width;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
    };
  }, [items, direction]);
  const move = (direction) => {
    pauseUntil.current = performance.now() + 1000;
    viewport.current?.scrollBy({
      left: direction * Math.min(viewport.current.clientWidth * 0.8, 700),
      behavior: "smooth",
    });
  };
  return (
    <section className="landing-trending" aria-label={title}>
      <div className="landing-strip-heading">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <div className="landing-strip-controls">
          <button
            onClick={() => move(-1)}
            aria-label={`Previous ${title}`}
            title="Previous titles"
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            onClick={() => move(1)}
            aria-label={`Next ${title}`}
            title="Next titles"
          >
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <div
        ref={viewport}
        className="landing-trending-viewport"
        tabIndex={0}
        aria-label={`${title} carousel`}
        onKeyDown={(event) => {
          if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            move(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        onWheel={() => {
          pauseUntil.current = performance.now() + 1000;
        }}
        onPointerDown={(event) => {
          suppressClick.current = false;
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          drag.current = {
            x: event.clientX,
            left: viewport.current.scrollLeft,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          const delta = event.clientX - drag.current.x;
          if (Math.abs(delta) > 6) {
            drag.current.moved = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            event.preventDefault();
            viewport.current.scrollLeft = drag.current.left - delta;
          }
        }}
        onPointerUp={() => {
          suppressClick.current = Boolean(drag.current?.moved);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onPointerLeave={() => {
          if (!drag.current?.moved) drag.current = null;
        }}
        onClickCapture={(event) => {
          if (suppressClick.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClick.current = false;
          }
        }}
      >
        <div className="landing-trending-track">
          {tiles.length ? (
            [0, 1, 2].map((copy) => (
              <div
                className="landing-trending-group"
                ref={copy === 1 ? group : undefined}
                key={copy}
                aria-hidden={copy !== 1 || undefined}
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
                    tabIndex={
                      copy !== 1 || index >= items.length ? -1 : undefined
                    }
                  >
                    <img
                      className="landing-title-thumbnail"
                      src={item.backdrop || item.poster}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      className="landing-title-logo"
                      src={item.logo || brandLogo}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      onError={(event) => {
                        if (!event.currentTarget.dataset.fallback) {
                          event.currentTarget.dataset.fallback = "true";
                          event.currentTarget.src = brandLogo;
                        }
                      }}
                    />
                  </Link>
                ))}
              </div>
            ))
          ) : loading ? (
            Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="landing-strip-skeleton" />
            ))
          ) : (
            <p className="landing-empty">
              This week&apos;s titles are unavailable. Check back soon.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function WatchDock() {
  const destination = useRef(null);
  const [docked, setDocked] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (destination.current) {
          setDocked(
            destination.current.getBoundingClientRect().top <=
              innerHeight - 110,
          );
          const section = document.getElementById("landing-rainflix");
          setVisible(
            Boolean(
              window.scrollY > 24 &&
              section &&
              section.getBoundingClientRect().top <= innerHeight * 0.65,
            ),
          );
        }
      });
    };
    update();
    const resize = new ResizeObserver(update);
    const landing = destination.current?.closest(".landing");
    if (landing) resize.observe(landing);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="landing-watch-dock" ref={destination}>
      <div
        className={`landing-watch-bar${visible || docked ? " is-visible" : ""}${docked ? " is-docked" : ""}`}
        aria-hidden={!visible && !docked}
        inert={!visible && !docked}
      >
        <Link
          className="landing-download landing-watch"
          to="/downloads"
          target="_blank"
          rel="noopener noreferrer"
        >
          Watch now
        </Link>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [featured, setFeatured] = useState(null);
  const [trending, setTrending] = useState([]);
  const [specials, setSpecials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [active, setActive] = useState("trailers");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    const decorate = async (items) => {
      try {
        return await api.getTitleLogos(items);
      } catch {
        return items;
      }
    };
    api
      .getTrendingMovies(1)
      .then(async (feed) => {
        if (feed.source !== "tmdb" || !feed.items.length)
          throw new Error("Featured movie unavailable");
        const first = feed.items[0];
        const details = await api.getDetails("movie", first.id);
        if (!cancelled) setFeatured({ ...first, ...details });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    api
      .getTrendingThisWeek(12)
      .then(async (feed) => {
        const items = feed.source === "tmdb" ? feed.items : [];
        if (!cancelled) setTrending(items);
        const decorated = await decorate(items);
        if (!cancelled) setTrending(decorated);
      })
      .catch(() => {});
    Promise.allSettled([
      api.getAnimeFeed("trending", 8),
      api.getTrendingKdramas(8),
    ]).then(async (results) => {
      const anime = results[0].status === "fulfilled" ? results[0].value : [];
      const dramas = results[1].status === "fulfilled" ? results[1].value : [];
      const combined = Array.from(
        { length: Math.max(anime.length, dramas.length) },
        (_, i) => [anime[i], dramas[i]],
      )
        .flat()
        .filter(Boolean);
      if (!cancelled) {
        setSpecials(combined);
        setLoading(false);
      }
      const decorated = await decorate(combined);
      if (!cancelled) setSpecials(decorated);
    });
    return () => {
      cancelled = true;
    };
  }, [revision]);
  useEffect(() => {
    const ids = ["trailers", "rainflix", "more-to-watch"];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting)
            setActive(entry.target.id.replace("landing-", ""));
      },
      { rootMargin: "-15% 0px -65% 0px" },
    );
    ids.forEach((id) => {
      const node = document.getElementById(`landing-${id}`);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [featured]);
  usePageMetadata({
    title: "RainFlix",
    description:
      "Discover movies, series, anime and K-dramas. Your next watch, your way.",
  });
  const scrollTo = (id) =>
    document
      .getElementById(`landing-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="landing">
      {featured && (
        <img
          className="landing-movie-backdrop"
          src={featured.backdrop || featured.poster}
          alt=""
          draggable={false}
        />
      )}
      <header className="landing-header">
        <nav className="landing-nav" aria-label="RainFlix introduction">
          <Link to="/" aria-label="RainFlix">
            <img src={wordmark} alt="RainFlix" draggable={false} />
          </Link>
          <Link
            className="landing-open"
            to="/home"
            target="_blank"
            rel="noopener noreferrer"
          >
            Open RainFlix on web
          </Link>
        </nav>
      </header>
      <nav className="landing-section-nav" aria-label="Landing sections">
        {[
          ["trailers", "Trailers"],
          ["rainflix", "RainFlix"],
          ["more-to-watch", "More to watch"],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            aria-current={active === id ? "location" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      {featured ? (
        <Trailer key={featured.id} movie={featured} />
      ) : (
        <section
          id="landing-trailers"
          className="landing-hero landing-feature-loading"
          aria-label="Trailers"
        >
          <img src={brandLogo} alt="RainFlix" />
          <h1>RainFlix</h1>
          {error ? (
            <>
              <p>This week&apos;s featured movie is unavailable.</p>
              <button
                className="landing-open"
                onClick={() => setRevision(revision + 1)}
              >
                Retry
              </button>
            </>
          ) : (
            <span role="status" className="landing-loading-line">
              <span className="sr-only">Loading featured movie</span>
            </span>
          )}
        </section>
      )}
      {featured && (
        <section
          className="landing-movie-details"
          aria-labelledby="landing-movie-title"
        >
          <div className="landing-movie-heading">
            <div>
              <div className="landing-movie-facts">
                {[
                  featured.year,
                  featured.runtime,
                  featured.genres?.slice(0, 2).join(" / "),
                  featured.rating !== "NR" ? `${featured.rating} / 10` : "",
                ]
                  .filter(Boolean)
                  .map((fact) => (
                    <span key={fact}>{fact}</span>
                  ))}
              </div>
            </div>
          </div>
          <p className="landing-synopsis">{featured.synopsis}</p>
          {!!featured.cast?.length && (
            <p className="landing-cast">
              <span>Starring</span>{" "}
              {featured.cast
                .slice(0, 4)
                .map((person) => person.name)
                .join(", ")}
            </p>
          )}
          {!!featured.backdrops?.length && (
            <div
              className="landing-stills"
              aria-label={`${featured.title} images`}
            >
              {featured.backdrops.slice(0, 5).map((url, index) => (
                <img
                  key={url}
                  src={url}
                  alt={`${featured.title} still ${index + 1}`}
                  loading="lazy"
                  draggable={false}
                />
              ))}
            </div>
          )}
        </section>
      )}
      <section
        id="landing-rainflix"
        className="landing-features"
        aria-labelledby="landing-features-title"
      >
        <p className="landing-eyebrow">ONE PLACE. YOUR WAY.</p>
        <h2 id="landing-features-title">What is RainFlix?</h2>
        <p className="landing-section-description">
          Less searching. More discovering.
        </p>
        <div className="landing-feature-grid">
          {[
            [
              Layers,
              "Find your next favorite",
              "Explore movies and series, follow the cast you love, and discover something unexpected.",
            ],
            [
              MonitorPlay,
              "Make it yours",
              "Watch through official services or use optional add-ons and native playback on Windows and Android.",
            ],
            [
              Bookmark,
              "Pick up where you left off",
              "Keep your favorites close. Your apps remember your watchlist, progress, and playback preferences.",
            ],
          ].map(([Icon, title, copy]) => (
            <article className="landing-feature" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section
        id="landing-more-to-watch"
        className="landing-discover"
        aria-labelledby="landing-discover-title"
      >
        <p className="landing-eyebrow">A WORLD OF STORIES</p>
        <h2 id="landing-discover-title">More to watch. More to love.</h2>
        <TrendingStrip
          items={trending}
          title="Trending this week"
          description="The movies and series everyone is discovering."
          loading={loading}
        />
        <TrendingStrip
          items={specials}
          direction={1}
          title="Anime & K-dramas"
          description="Discover anime and Korean dramas, too. Find your next obsession."
          loading={loading}
        />
      </section>
      <section className="landing-about">
        <div>
          <p className="landing-eyebrow">MADE FOR YOUR NEXT WATCH</p>
          <h2>A little more about RainFlix.</h2>
          <p>
            A catalog on the web. Your own viewing experience in the apps.
            Discover how RainFlix brings it all together.
          </p>
        </div>
        <a
          className="landing-open"
          href="https://github.com/Kanonsoft/RainFlix#readme"
          target="_blank"
          rel="noopener noreferrer"
        >
          Read about RainFlix
        </a>
      </section>
      <section className="landing-bottom">
        <h2>Your next story starts here.</h2>
        <WatchDock />
        <p>Find a favorite. Start a watchlist. Make it your RainFlix.</p>
        <div className="landing-platform-links">
          <Link to="/downloads" target="_blank" rel="noopener noreferrer">
            Windows & Android
          </Link>
          <span>or</span>
          <Link to="/home" target="_blank" rel="noopener noreferrer">
            Explore on the web
          </Link>
        </div>
      </section>
    </div>
  );
}
