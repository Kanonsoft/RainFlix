(function () {
  const FALLBACK_TITLES = [
    {
      id: 693134,
      mediaType: "movie",
      title: "Dune: Part Two",
      year: "2024",
      rating: "8.1",
      poster: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg",
      synopsis:
        "Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.",
    },
    {
      id: 872585,
      mediaType: "movie",
      title: "Oppenheimer",
      year: "2023",
      rating: "8.1",
      poster: "https://image.tmdb.org/t/p/w500/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg",
      synopsis:
        "The story of J. Robert Oppenheimer and the creation of the atomic bomb during World War II.",
    },
    {
      id: 533535,
      mediaType: "movie",
      title: "Deadpool & Wolverine",
      year: "2024",
      rating: "7.6",
      poster: "https://image.tmdb.org/t/p/w500/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg",
      synopsis:
        "A listless Wade Wilson is pulled back into action when his universe faces an existential threat.",
    },
    {
      id: 786892,
      mediaType: "movie",
      title: "Furiosa: A Mad Max Saga",
      year: "2024",
      rating: "7.5",
      poster: "https://image.tmdb.org/t/p/w500/iADOJ8Zymht2JPMoy3R7xceZprc.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/wNAhuOZ3Zf84jCIlrcI6JhgmY5q.jpg",
      synopsis:
        "Young Furiosa is swept into a brutal wasteland war before crossing paths with the warlord who will shape her fate.",
    },
    {
      id: 1022789,
      mediaType: "movie",
      title: "Inside Out 2",
      year: "2024",
      rating: "7.6",
      poster: "https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/p5ozvmdgsmbWe0H8Xk7Rc8SCwAB.jpg",
      synopsis:
        "Riley's mind welcomes new emotions as she navigates the complicated shift into her teenage years.",
    },
    {
      id: 100088,
      mediaType: "tv",
      title: "The Last of Us",
      year: "2023",
      rating: "8.6",
      poster: "https://image.tmdb.org/t/p/w500/uKvVjHNqB5VmOrdxqAt2F7J78ED.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
      synopsis:
        "A hardened survivor escorts a teenager across a fractured America after a global pandemic changes everything.",
      seasons: 2,
      episodeCount: 16,
    },
    {
      id: 126308,
      mediaType: "tv",
      title: "Shogun",
      year: "2024",
      rating: "8.5",
      poster: "https://image.tmdb.org/t/p/w500/7O4iVfOMQmdCSxhOg1WnzG1AgYT.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/oFAukXiMPrwLpbulGmB5suEZlrm.jpg",
      synopsis:
        "A shipwrecked English pilot becomes entangled in the political struggle of feudal Japan.",
      seasons: 1,
      episodeCount: 10,
    },
    {
      id: 94997,
      mediaType: "tv",
      title: "House of the Dragon",
      year: "2022",
      rating: "8.3",
      poster: "https://image.tmdb.org/t/p/w500/7QMsOTMUswlwxJP0rTTZfmz2tX2.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/etj8E2o0Bud0HkONVQPjyCkIvpv.jpg",
      synopsis:
        "The Targaryen dynasty reaches a breaking point as family power turns into fire and blood.",
      seasons: 2,
      episodeCount: 18,
    },
    {
      id: 106379,
      mediaType: "tv",
      title: "Fallout",
      year: "2024",
      rating: "8.3",
      poster: "https://image.tmdb.org/t/p/w500/AnsSKR9LuK0T9bAOcPVA3PUvyWj.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/2meX1nMdScFOoV4370rqHWKmXhY.jpg",
      synopsis:
        "A vault dweller steps into a bizarre and violent wasteland shaped by old-world ideals and new-world chaos.",
      seasons: 1,
      episodeCount: 8,
    },
    {
      id: 76479,
      mediaType: "tv",
      title: "The Boys",
      year: "2019",
      rating: "8.5",
      poster: "https://image.tmdb.org/t/p/w500/2zmTngn1tYC1AvfnrFLhxeD82hz.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/7cqKGQMnNabzOpi7qaIgZvQ7NGV.jpg",
      synopsis:
        "A crew of vigilantes takes on celebrity superheroes corrupted by fame, power, and corporate control.",
      seasons: 4,
      episodeCount: 32,
    },
    {
      id: 414906,
      mediaType: "movie",
      title: "The Batman",
      year: "2022",
      rating: "7.7",
      poster: "https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/b0PlSFdDwbyK0cf5RxwDpaOJQvQ.jpg",
      synopsis:
        "Batman ventures into Gotham's underworld when a sadistic killer leaves behind a trail of cryptic clues.",
    },
    {
      id: 823464,
      mediaType: "movie",
      title: "Godzilla x Kong: The New Empire",
      year: "2024",
      rating: "7.1",
      poster: "https://image.tmdb.org/t/p/w500/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/1XDDXPXGiI8id7MrUxK36ke7gkX.jpg",
      synopsis:
        "Godzilla and Kong face a colossal threat hidden deep within the world.",
    },
    {
      id: 1184918,
      mediaType: "movie",
      title: "The Wild Robot",
      year: "2024",
      rating: "8.3",
      poster: "https://image.tmdb.org/t/p/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/v9acaWVVFdZT5yAU7J2QjwfhXyD.jpg",
      synopsis:
        "A robot stranded on an island learns to survive, adapt, and care for an orphaned gosling.",
    },
    {
      id: 929590,
      mediaType: "movie",
      title: "Civil War",
      year: "2024",
      rating: "6.9",
      poster: "https://image.tmdb.org/t/p/w500/sh7Rg8Er3tFcN9BpKIPOMvALgZd.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/z121dSTR7PY9KxKuvwiIFSYW8cf.jpg",
      synopsis:
        "A team of journalists races across a fractured America as conflict reaches the nation's capital.",
    },
    {
      id: 66732,
      mediaType: "tv",
      title: "Stranger Things",
      year: "2016",
      rating: "8.6",
      poster: "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
      synopsis:
        "Friends in a small town uncover secret experiments, supernatural forces, and one very unusual girl.",
      seasons: 4,
      episodeCount: 34,
    },
    {
      id: 136315,
      mediaType: "tv",
      title: "The Bear",
      year: "2022",
      rating: "8.2",
      poster: "https://image.tmdb.org/t/p/w500/sHFlbKS3WLqMnp9t2ghADIJFnuQ.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/bWdgYyAG8MeuN6m8RTdE6JrMdMS.jpg",
      synopsis:
        "A young chef returns to Chicago to run his family's sandwich shop and rebuild the team around it.",
      seasons: 3,
      episodeCount: 28,
    },
    {
      id: 84958,
      mediaType: "tv",
      title: "Loki",
      year: "2021",
      rating: "8.2",
      poster: "https://image.tmdb.org/t/p/w500/voHUmluYmKyleFkTu3lOXQG702u.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/rqDoCJEM3SNaX1h2PjCCVkgoql2.jpg",
      synopsis:
        "The God of Mischief steps out of his timeline and into a larger conflict across time itself.",
      seasons: 2,
      episodeCount: 12,
    },
    {
      id: 94605,
      mediaType: "tv",
      title: "Arcane",
      year: "2021",
      rating: "8.8",
      poster: "https://image.tmdb.org/t/p/w500/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/rIe3PnM6S7IBUmvNwDkBMX0i9EZ.jpg",
      synopsis:
        "Two sisters stand on opposite sides of a brewing war between an idealistic city and its oppressed undercity.",
      seasons: 2,
      episodeCount: 18,
    },
    {
      id: 1399,
      mediaType: "tv",
      title: "Game of Thrones",
      year: "2011",
      rating: "8.5",
      poster: "https://image.tmdb.org/t/p/w500/1XS1oqL89opfnbLl8WnZY1O1uJx.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/2OMB0ynKlyIenMJWI2Dy9IWT4c.jpg",
      synopsis:
        "Noble families fight for control of a vast kingdom while an ancient enemy gathers in the north.",
      seasons: 8,
      episodeCount: 73,
    },
    {
      id: 937287,
      mediaType: "movie",
      title: "Challengers",
      year: "2024",
      rating: "7.0",
      poster: "https://image.tmdb.org/t/p/w500/H6vke7zGiuLsz4v4RPeReb9rsv.jpg",
      backdrop:
        "https://image.tmdb.org/t/p/w1280/4CcUgdiGe83MeqJW1NyJVmZqRrF.jpg",
      synopsis:
        "A tennis champion turned coach pushes her husband into a match against his former best friend and her former lover.",
    },
  ];

  const PAGE_SIZE = 12;
  const GENRES = [
    {
      slug: "action-adventure",
      name: "Action & Adventure",
      movieGenreIds: [28, 12],
      tvGenreIds: [10759],
    },
    {
      slug: "animation",
      name: "Animation",
      movieGenreIds: [16],
      tvGenreIds: [16],
    },
    { slug: "comedy", name: "Comedy", movieGenreIds: [35], tvGenreIds: [35] },
    { slug: "crime", name: "Crime", movieGenreIds: [80], tvGenreIds: [80] },
    {
      slug: "documentary",
      name: "Documentary",
      movieGenreIds: [99],
      tvGenreIds: [99],
    },
    { slug: "drama", name: "Drama", movieGenreIds: [18], tvGenreIds: [18] },
    {
      slug: "family",
      name: "Family",
      movieGenreIds: [10751],
      tvGenreIds: [10751],
    },
    {
      slug: "fantasy-scifi",
      name: "Fantasy & Sci-Fi",
      movieGenreIds: [14, 878],
      tvGenreIds: [10765],
    },
    { slug: "history", name: "History", movieGenreIds: [36], tvGenreIds: [] },
    { slug: "horror", name: "Horror", movieGenreIds: [27], tvGenreIds: [] },
    { slug: "kids", name: "Kids", movieGenreIds: [10751], tvGenreIds: [10762] },
    { slug: "music", name: "Music", movieGenreIds: [10402], tvGenreIds: [] },
    {
      slug: "mystery",
      name: "Mystery",
      movieGenreIds: [9648],
      tvGenreIds: [9648],
    },
    { slug: "news", name: "News", movieGenreIds: [], tvGenreIds: [10763] },
    {
      slug: "reality",
      name: "Reality",
      movieGenreIds: [],
      tvGenreIds: [10764],
    },
    {
      slug: "romance-soap",
      name: "Romance & Soap",
      movieGenreIds: [10749],
      tvGenreIds: [10766],
    },
    { slug: "talk", name: "Talk", movieGenreIds: [], tvGenreIds: [10767] },
    {
      slug: "thriller",
      name: "Thriller",
      movieGenreIds: [53],
      tvGenreIds: [9648],
    },
    {
      slug: "tv-movie",
      name: "TV Movie",
      movieGenreIds: [10770],
      tvGenreIds: [],
    },
    {
      slug: "war-politics",
      name: "War & Politics",
      movieGenreIds: [10752],
      tvGenreIds: [10768],
    },
    { slug: "western", name: "Western", movieGenreIds: [37], tvGenreIds: [37] },
  ];
  const TMDB_CACHE_PREFIX = "rainflix:tmdb:v1:";
  const TITLE_LOGO_CACHE_KEY = "rainflix:title-logos:v1";
  const TITLE_LOGO_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const inFlightTmdbRequests = new Map();
  let titleLogoCache;

  function config() {
    return window.RAINFLIX_CONFIG || {};
  }

  function hasTmdbCredentials() {
    return Boolean(config().tmdbAccessToken || config().tmdbApiKey);
  }

  function readTmdbCache(key) {
    try {
      const cached = JSON.parse(window.localStorage.getItem(key));

      if (!cached || typeof cached !== "object" || !("data" in cached)) {
        return null;
      }

      return cached;
    } catch (error) {
      return null;
    }
  }

  function pruneTmdbCache() {
    const maxEntries = Math.max(10, Number(config().tmdbCacheMaxEntries) || 60);

    try {
      const entries = [];

      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);

        if (!key?.startsWith(TMDB_CACHE_PREFIX)) {
          continue;
        }

        const cached = readTmdbCache(key);
        entries.push({ key, storedAt: Number(cached?.storedAt) || 0 });
      }

      entries
        .sort((left, right) => right.storedAt - left.storedAt)
        .slice(maxEntries)
        .forEach(({ key }) => window.localStorage.removeItem(key));
    } catch (error) {
      // Storage can be unavailable in private or restricted browsing modes.
    }
  }

  function writeTmdbCache(key, data) {
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          data,
          expiresAt: Date.now() + (Number(config().tmdbCacheTtlMs) || 900000),
          storedAt: Date.now(),
        }),
      );
      pruneTmdbCache();
    } catch (error) {
      // A full or disabled cache should never prevent the catalog from loading.
    }
  }

  function readTitleLogoCache() {
    if (titleLogoCache) {
      return titleLogoCache;
    }

    try {
      const cache = JSON.parse(
        window.localStorage.getItem(TITLE_LOGO_CACHE_KEY) || "{}",
      );
      titleLogoCache = cache && typeof cache === "object" ? cache : {};
    } catch (error) {
      titleLogoCache = {};
    }

    return titleLogoCache;
  }

  function writeTitleLogoCache(cache) {
    try {
      const entries = Object.entries(cache)
        .sort(
          ([, left], [, right]) => (right.storedAt || 0) - (left.storedAt || 0),
        )
        .slice(0, 100);
      titleLogoCache = Object.fromEntries(entries);
      window.localStorage.setItem(
        TITLE_LOGO_CACHE_KEY,
        JSON.stringify(titleLogoCache),
      );
    } catch (error) {
      // Logo caching is optional when storage is unavailable.
    }
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function normalizeMediaType(mediaType) {
    if (mediaType === "tv" || mediaType === "series") {
      return "tv";
    }

    return "movie";
  }

  function mediaLabel(mediaType) {
    const normalizedType = normalizeMediaType(mediaType);

    if (normalizedType === "tv") {
      return "Series";
    }

    return "Movie";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function imageUrl(path, size = "w500") {
    if (!path) {
      return "";
    }

    if (String(path).startsWith("http")) {
      return path;
    }

    return `${config().tmdbImageBaseUrl || "https://image.tmdb.org/t/p"}/${size}${path}`;
  }

  function createImageFallback(title, wide = false) {
    const size = wide ? "1280x720" : "600x900";
    return `https://placehold.co/${size}/07111f/bae6fd?text=${encodeURIComponent(title || "RainFlix")}`;
  }

  function buildTmdbUrl(path, params = {}) {
    const apiBaseUrl =
      config().tmdbApiBaseUrl || "https://api.themoviedb.org/3";
    const url = new URL(`${apiBaseUrl}/${path.replace(/^\//, "")}`);

    url.searchParams.set("language", "en-US");

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    if (config().tmdbApiKey && !config().tmdbAccessToken) {
      url.searchParams.set("api_key", config().tmdbApiKey);
    }

    return url;
  }

  async function tmdbFetch(path, params = {}, options = {}) {
    if (!hasTmdbCredentials()) {
      return null;
    }

    const requestUrl = buildTmdbUrl(path, params).toString();
    const cacheKey = `${TMDB_CACHE_PREFIX}${requestUrl}`;
    const shouldPersist = options.persist !== false;
    const requestCache = options.cache || "default";
    const inFlightKey = shouldPersist
      ? requestUrl
      : `${requestUrl}::${requestCache}`;
    const cached = shouldPersist ? readTmdbCache(cacheKey) : null;

    if (cached?.expiresAt > Date.now()) {
      return cached.data;
    }

    if (inFlightTmdbRequests.has(inFlightKey)) {
      return inFlightTmdbRequests.get(inFlightKey);
    }

    const headers = {};

    if (config().tmdbAccessToken) {
      headers.Authorization = `Bearer ${config().tmdbAccessToken}`;
    }

    const request = (async () => {
      try {
        const response = await fetch(requestUrl, {
          cache: requestCache,
          headers,
          ...(options.timeoutMs
            ? { signal: AbortSignal.timeout(options.timeoutMs) }
            : {}),
        });

        if (!response.ok) {
          throw new Error(`TMDb request failed: ${response.status}`);
        }

        const data = await response.json();

        if (shouldPersist) {
          writeTmdbCache(cacheKey, data);
        }

        return data;
      } catch (error) {
        if (cached?.data) {
          return cached.data;
        }

        throw error;
      } finally {
        inFlightTmdbRequests.delete(inFlightKey);
      }
    })();

    inFlightTmdbRequests.set(inFlightKey, request);
    return request;
  }

  function mapTmdbTitle(item, fallbackType) {
    const mediaType = normalizeMediaType(item.media_type || fallbackType);
    const title = mediaType === "tv" ? item.name : item.title;
    const releaseDate =
      mediaType === "tv" ? item.first_air_date : item.release_date;

    return {
      id: item.id,
      mediaType,
      title: title || "Untitled",
      year: releaseDate ? releaseDate.slice(0, 4) : "TBA",
      rating: item.vote_average ? Number(item.vote_average).toFixed(1) : "NR",
      voteAverage: Number(item.vote_average || 0),
      voteCount: Number(item.vote_count || 0),
      originalLanguage: item.original_language || "",
      poster: imageUrl(item.poster_path, "w500"),
      backdrop:
        imageUrl(item.backdrop_path, "w1280") ||
        imageUrl(item.poster_path, "w780"),
      genreIds: Array.isArray(item.genre_ids) ? item.genre_ids : [],
      synopsis: item.overview || "No synopsis available yet.",
    };
  }

  function uniqueTitles(items = [], limit = Number.POSITIVE_INFINITY) {
    const seen = new Set();

    return items
      .filter((item) => {
        if (!item?.id || !["movie", "tv"].includes(item.mediaType)) {
          return false;
        }

        const key = `${item.mediaType}:${item.id}`;
        if (seen.has(key)) {
          return false;
        }

        seen.add(key);
        return true;
      })
      .slice(0, limit);
  }

  function mapRelatedTitles(items = [], fallbackType) {
    return items
      .filter(
        (item) =>
          item?.adult !== true &&
          ["movie", "tv"].includes(item?.media_type || fallbackType),
      )
      .sort(
        (left, right) =>
          Number(right.popularity || 0) - Number(left.popularity || 0) ||
          Number(right.vote_count || 0) - Number(left.vote_count || 0),
      )
      .map((item) => mapTmdbTitle(item, fallbackType))
      .filter((item) => item.poster || item.backdrop);
  }

  function relationshipScore(item, query) {
    const name = String(item?.name || "")
      .trim()
      .toLocaleLowerCase();
    const cleanQuery = String(query || "")
      .trim()
      .toLocaleLowerCase();

    if (!name || !cleanQuery) {
      return 0;
    }

    const relevance =
      name === cleanQuery
        ? 3
        : name.startsWith(cleanQuery)
          ? 2
          : name.includes(cleanQuery)
            ? 1
            : 0;

    return relevance ? relevance * 1_000_000 + Number(item.popularity || 0) : 0;
  }

  function mapDetailGenres(genres = [], mediaType) {
    const idKey =
      normalizeMediaType(mediaType) === "tv" ? "tvGenreIds" : "movieGenreIds";
    const mapped = genres
      .map((sourceGenre) => {
        const candidates = GENRES.filter((genre) =>
          genre[idKey].includes(Number(sourceGenre.id)),
        );
        const exactName = candidates.find(
          (genre) =>
            genre.name.toLocaleLowerCase() ===
            String(sourceGenre.name || "").toLocaleLowerCase(),
        );

        return exactName || candidates[0] || null;
      })
      .filter(Boolean);

    return mapped.filter(
      (genre, index) =>
        mapped.findIndex((candidate) => candidate.slug === genre.slug) ===
        index,
    );
  }

  function preferredLogo(images) {
    const logos = [...(images?.logos || [])];

    logos.sort((left, right) => {
      const languageDifference =
        Number(right.iso_639_1 === "en") - Number(left.iso_639_1 === "en");

      if (languageDifference) {
        return languageDifference;
      }

      const voteDifference =
        (right.vote_average || 0) - (left.vote_average || 0);

      if (voteDifference) {
        return voteDifference;
      }

      return (right.width || 0) - (left.width || 0);
    });

    return logos[0]?.file_path ? imageUrl(logos[0].file_path, "w500") : "";
  }

  function preferredTrailer(videos) {
    const trailers = (videos?.results || [])
      .filter(
        (video) =>
          video.site === "YouTube" &&
          video.key &&
          (video.type === "Trailer" || video.type === "Teaser"),
      )
      .sort((left, right) => {
        const officialDifference =
          Number(right.official) - Number(left.official);

        if (officialDifference) {
          return officialDifference;
        }

        const typeDifference =
          Number(right.type === "Trailer") - Number(left.type === "Trailer");

        if (typeDifference) {
          return typeDifference;
        }

        const languageDifference =
          Number(right.iso_639_1 === "en") - Number(left.iso_639_1 === "en");

        if (languageDifference) {
          return languageDifference;
        }

        return String(right.published_at || "").localeCompare(
          String(left.published_at || ""),
        );
      });

    return trailers[0]?.key || "";
  }

  function mapTmdbDetails(item, mediaType) {
    const normalizedType = normalizeMediaType(mediaType);
    const releaseDate =
      normalizedType === "tv" ? item.first_air_date : item.release_date;
    const episodeRuntime = (item.episode_run_time || []).find(
      (runtime) => Number(runtime) > 0,
    );

    return {
      id: item.id,
      imdbId: item.external_ids?.imdb_id || item.imdb_id || "",
      mediaType: normalizedType,
      title: normalizedType === "tv" ? item.name : item.title,
      year: releaseDate ? releaseDate.slice(0, 4) : "TBA",
      rating: item.vote_average ? Number(item.vote_average).toFixed(1) : "NR",
      poster: imageUrl(item.poster_path, "w500"),
      backdrop:
        imageUrl(item.backdrop_path, "w1280") ||
        imageUrl(item.poster_path, "w780"),
      logo: preferredLogo(item.images),
      synopsis: item.overview || "No synopsis available yet.",
      tagline: item.tagline || "",
      releaseDate: releaseDate || "",
      status: item.status || "",
      genres: (item.genres || []).map((genre) => genre.name).filter(Boolean),
      genreLinks: mapDetailGenres(item.genres || [], normalizedType),
      cast: (item.credits?.cast || []).slice(0, 10).map((person) => ({
        id: person.id,
        name: person.name || "Unknown cast member",
        character: person.character || "",
        image: imageUrl(person.profile_path, "w185"),
      })),
      productionCompanies: (item.production_companies || [])
        .filter((company) => company.id && company.name)
        .map((company) => ({
          id: company.id,
          name: company.name,
          logo: imageUrl(company.logo_path, "w185"),
        })),
      trailerKey: preferredTrailer(item.videos),
      backdrops: [
        ...new Set(
          (item.images?.backdrops || [])
            .map((image) => imageUrl(image.file_path, "w780"))
            .filter(Boolean),
        ),
      ].slice(0, 8),
      duration:
        normalizedType === "tv"
          ? episodeRuntime
            ? `${episodeRuntime} min episodes`
            : ""
          : item.runtime
            ? `${item.runtime} min`
            : "",
      runtime:
        normalizedType === "tv"
          ? `${item.number_of_seasons || 1} season${item.number_of_seasons === 1 ? "" : "s"}`
          : item.runtime
            ? `${item.runtime} min`
            : "",
      seasons:
        normalizedType === "tv"
          ? (item.seasons || [])
              .filter((season) => season.season_number > 0)
              .map((season) => ({
                seasonNumber: season.season_number,
                name: season.name || `Season ${season.season_number}`,
                episodeCount: season.episode_count || 0,
              }))
          : [],
    };
  }

  async function getTitleLogo(mediaType, id) {
    const normalizedType = normalizeMediaType(mediaType);
    const cacheKey = `${normalizedType}:${id}`;
    const logoCache = readTitleLogoCache();
    const cached = logoCache[cacheKey];

    if (cached && cached.expiresAt > Date.now()) {
      return cached.url || "";
    }

    try {
      const data = await tmdbFetch(
        `${normalizedType}/${id}/images`,
        {
          include_image_language: "en,null",
        },
        { persist: false },
      );
      const url = preferredLogo(data);
      logoCache[cacheKey] = {
        url,
        expiresAt: Date.now() + TITLE_LOGO_CACHE_TTL,
        storedAt: Date.now(),
      };
      writeTitleLogoCache(logoCache);
      return url;
    } catch (error) {
      return "";
    }
  }

  async function getTitleLogos(items = []) {
    return Promise.all(
      items.map(async (item) => ({
        ...item,
        logo: item.logo || (await getTitleLogo(item.mediaType, item.id)),
      })),
    );
  }

  function mapFallbackDetails(item) {
    const seasonCount = item.seasons || 1;
    const totalEpisodes = item.episodeCount || 8;
    const episodesPerSeason = Math.max(
      1,
      Math.ceil(totalEpisodes / seasonCount),
    );

    return {
      ...item,
      cast: [],
      duration: "",
      genres: [],
      genreLinks: [],
      productionCompanies: [],
      releaseDate: item.year || "",
      status: item.mediaType === "tv" ? "Returning Series" : "Released",
      tagline: "",
      trailerKey: "",
      runtime:
        item.mediaType === "tv"
          ? `${seasonCount} season${seasonCount === 1 ? "" : "s"}`
          : "",
      seasons:
        item.mediaType === "tv"
          ? Array.from({ length: seasonCount }, (_, index) => ({
              seasonNumber: index + 1,
              name: `Season ${index + 1}`,
              episodeCount: episodesPerSeason,
            }))
          : [],
    };
  }

  function fallbackItems(filter = "all") {
    if (filter === "movie") {
      return FALLBACK_TITLES.filter((item) => item.mediaType === "movie");
    }

    if (filter === "tv" || filter === "series") {
      return FALLBACK_TITLES.filter((item) => item.mediaType === "tv");
    }

    return [...FALLBACK_TITLES];
  }

  async function getLoaderPosters(limit = 35) {
    const posterLimit = Math.max(1, Number.parseInt(limit, 10) || 35);

    try {
      const pageCount = Math.min(3, Math.ceil(posterLimit / 20));
      const pages = await Promise.all(
        Array.from({ length: pageCount }, (_, index) =>
          tmdbFetch(
            "trending/movie/week",
            { page: index + 1 },
            { cache: "no-store", persist: false },
          ),
        ),
      );
      const posters = [
        ...new Set(
          pages
            .flatMap((page) => page?.results || [])
            .map((item) => imageUrl(item.poster_path, "w500"))
            .filter(Boolean),
        ),
      ];

      if (posters.length) {
        return posters.slice(0, posterLimit);
      }
    } catch (error) {
      console.warn("RainFlix loader posters could not refresh:", error);
    }

    return FALLBACK_TITLES.filter((item) => item.mediaType === "movie")
      .map((item) => item.poster)
      .filter(Boolean)
      .slice(0, posterLimit);
  }

  function fallbackPage(filter, page, limit = PAGE_SIZE) {
    const allItems = fallbackItems(filter);
    const start = (page - 1) * limit;

    return {
      items: allItems.slice(start, start + limit),
      page,
      totalPages: Math.max(1, Math.ceil(allItems.length / limit)),
      source: "demo",
    };
  }

  function fallbackFeed(filter, limit = PAGE_SIZE, offset = 0) {
    return {
      items: fallbackItems(filter).slice(offset, offset + limit),
      source: "demo",
    };
  }

  async function getTrending({
    filter = "all",
    page = 1,
    limit = PAGE_SIZE,
  } = {}) {
    const normalizedFilter = filter === "series" ? "tv" : filter;

    try {
      const endpointType =
        normalizedFilter === "movie" || normalizedFilter === "tv"
          ? normalizedFilter
          : "all";
      const data = await tmdbFetch(`trending/${endpointType}/week`, { page });

      if (!data) {
        return fallbackPage(normalizedFilter, page, limit);
      }

      const items = (data.results || [])
        .filter(
          (item) =>
            item.media_type === "movie" ||
            item.media_type === "tv" ||
            endpointType !== "all",
        )
        .map((item) => mapTmdbTitle(item, endpointType))
        .filter((item) => item.poster || item.backdrop)
        .slice(0, limit);

      return {
        items,
        page,
        totalPages: Math.min(data.total_pages || 1, 500),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return fallbackPage(normalizedFilter, page, limit);
    }
  }

  function getGenre(slug) {
    const cleanSlug = String(slug || "")
      .trim()
      .toLowerCase();
    return GENRES.find((genre) => genre.slug === cleanSlug) || null;
  }

  async function getGenreTitles({
    slug,
    filter = "all",
    page = 1,
    limit = PAGE_SIZE,
    sortBy = "popularity",
    year = "",
  } = {}) {
    const genre = getGenre(slug);
    const normalizedFilter = filter === "series" ? "tv" : filter;
    const requestedTypes =
      normalizedFilter === "movie" || normalizedFilter === "tv"
        ? [normalizedFilter]
        : ["movie", "tv"];
    const mediaTypes = requestedTypes.filter((mediaType) => {
      const genreIds =
        mediaType === "movie" ? genre?.movieGenreIds : genre?.tvGenreIds;
      return genreIds?.length;
    });
    const currentYear = new Date().getFullYear();
    const requestedYear = /^\d{4}$/.test(String(year))
      ? Number.parseInt(year, 10)
      : 0;
    const selectedYear = requestedYear
      ? Math.min(currentYear, Math.max(1900, requestedYear))
      : 0;
    const startDate = selectedYear ? `${selectedYear}-01-01` : "";
    const endDate = selectedYear
      ? selectedYear === currentYear
        ? today()
        : `${selectedYear}-12-31`
      : today();

    const genreFallbackPage = () => {
      const items = selectedYear
        ? fallbackItems(normalizedFilter).filter(
            (item) => item.year === String(selectedYear),
          )
        : fallbackItems(normalizedFilter);
      const start = (page - 1) * limit;

      return {
        items: items.slice(start, start + limit),
        page,
        totalPages: Math.max(1, Math.ceil(items.length / limit)),
        source: "demo",
      };
    };

    if (!genre || !mediaTypes.length) {
      return {
        items: [],
        page,
        totalPages: 1,
        source: hasTmdbCredentials() ? "tmdb" : "demo",
      };
    }

    try {
      const responses = await Promise.all(
        mediaTypes.map(async (mediaType) => {
          const genreIds =
            mediaType === "movie" ? genre.movieGenreIds : genre.tvGenreIds;
          const newest = sortBy === "newest";
          const params = {
            include_adult: "false",
            page,
            sort_by: newest
              ? mediaType === "movie"
                ? "primary_release_date.desc"
                : "first_air_date.desc"
              : "popularity.desc",
            "vote_count.gte": 5,
            with_genres: genreIds.join("|"),
          };

          if (mediaType === "movie") {
            params.include_video = "false";
            if (startDate) {
              params["primary_release_date.gte"] = startDate;
            }
            params["primary_release_date.lte"] = endDate;
            params.region = config().tmdbRegion || "US";
          } else {
            params.include_null_first_air_dates = "false";
            if (startDate) {
              params["first_air_date.gte"] = startDate;
            }
            params["first_air_date.lte"] = endDate;
          }

          return {
            data: await tmdbFetch(`discover/${mediaType}`, params),
            mediaType,
          };
        }),
      );

      if (responses.every(({ data }) => !data)) {
        return genreFallbackPage();
      }

      const compareItems = (left, right) => {
        if (sortBy === "newest") {
          const leftDate = left.release_date || left.first_air_date || "";
          const rightDate = right.release_date || right.first_air_date || "";
          return rightDate.localeCompare(leftDate);
        }

        return (right.popularity || 0) - (left.popularity || 0);
      };
      const queues = responses.map(({ data, mediaType }) =>
        (data?.results || [])
          .map((item) => ({
            ...item,
            media_type: mediaType,
          }))
          .filter((item) => item.poster_path || item.backdrop_path)
          .sort(compareItems),
      );
      const selectedItems = [];

      while (
        selectedItems.length < limit &&
        queues.some((queue) => queue.length)
      ) {
        queues.forEach((queue) => {
          if (selectedItems.length < limit && queue.length) {
            selectedItems.push(queue.shift());
          }
        });
      }

      return {
        items: selectedItems
          .map((item) => mapTmdbTitle(item, item.media_type))
          .filter((item) => item.poster || item.backdrop)
          .slice(0, limit),
        page,
        totalPages: Math.min(
          Math.max(...responses.map(({ data }) => data?.total_pages || 1)),
          500,
        ),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return genreFallbackPage();
    }
  }

  async function getYearTitles({
    year,
    filter = "all",
    page = 1,
    limit = PAGE_SIZE,
    sortBy = "popularity",
  } = {}) {
    const currentYear = new Date().getFullYear();
    const selectedYear = Math.min(
      currentYear,
      Math.max(1900, Number.parseInt(year, 10) || currentYear),
    );
    const normalizedFilter = filter === "series" ? "tv" : filter;
    const mediaTypes =
      normalizedFilter === "movie" || normalizedFilter === "tv"
        ? [normalizedFilter]
        : ["movie", "tv"];
    const startDate = `${selectedYear}-01-01`;
    const yearEnd = `${selectedYear}-12-31`;
    const endDate = selectedYear === currentYear ? today() : yearEnd;

    try {
      const responses = await Promise.all(
        mediaTypes.map(async (mediaType) => {
          const newest = sortBy === "newest";
          const params = {
            include_adult: "false",
            page,
            sort_by: newest
              ? mediaType === "movie"
                ? "primary_release_date.desc"
                : "first_air_date.desc"
              : "popularity.desc",
            "vote_count.gte": 5,
          };

          if (mediaType === "movie") {
            params.include_video = "false";
            params["primary_release_date.gte"] = startDate;
            params["primary_release_date.lte"] = endDate;
            params.region = config().tmdbRegion || "US";
          } else {
            params.include_null_first_air_dates = "false";
            params["first_air_date.gte"] = startDate;
            params["first_air_date.lte"] = endDate;
          }

          return {
            data: await tmdbFetch(`discover/${mediaType}`, params),
            mediaType,
          };
        }),
      );

      if (responses.every(({ data }) => !data)) {
        const items = fallbackItems(normalizedFilter).filter(
          (item) => item.year === String(selectedYear),
        );
        const start = (page - 1) * limit;

        return {
          items: items.slice(start, start + limit),
          page,
          totalPages: Math.max(1, Math.ceil(items.length / limit)),
          source: "demo",
        };
      }

      const compareItems = (left, right) => {
        if (sortBy === "newest") {
          const leftDate = left.release_date || left.first_air_date || "";
          const rightDate = right.release_date || right.first_air_date || "";
          return rightDate.localeCompare(leftDate);
        }

        return (right.popularity || 0) - (left.popularity || 0);
      };
      const queues = responses.map(({ data, mediaType }) =>
        (data?.results || [])
          .map((item) => ({ ...item, media_type: mediaType }))
          .filter((item) => item.poster_path || item.backdrop_path)
          .sort(compareItems),
      );
      const selectedItems = [];

      while (
        selectedItems.length < limit &&
        queues.some((queue) => queue.length)
      ) {
        queues.forEach((queue) => {
          if (selectedItems.length < limit && queue.length) {
            selectedItems.push(queue.shift());
          }
        });
      }

      return {
        items: selectedItems
          .map((item) => mapTmdbTitle(item, item.media_type))
          .slice(0, limit),
        page,
        totalPages: Math.min(
          Math.max(...responses.map(({ data }) => data?.total_pages || 1)),
          500,
        ),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      const items = fallbackItems(normalizedFilter).filter(
        (item) => item.year === String(selectedYear),
      );
      const start = (page - 1) * limit;

      return {
        items: items.slice(start, start + limit),
        page,
        totalPages: Math.max(1, Math.ceil(items.length / limit)),
        source: "demo",
      };
    }
  }

  async function getTrendingThisWeek(limit = PAGE_SIZE) {
    try {
      const data = await tmdbFetch("trending/all/week", { page: 1 });

      if (!data) {
        return fallbackFeed("all", limit);
      }

      return {
        items: (data.results || [])
          .filter(
            (item) => item.media_type === "movie" || item.media_type === "tv",
          )
          .map((item) => mapTmdbTitle(item))
          .filter((item) => item.poster || item.backdrop)
          .slice(0, limit),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return fallbackFeed("all", limit);
    }
  }

  async function getNewestMovies(limit = PAGE_SIZE) {
    try {
      const data = await tmdbFetch("discover/movie", {
        include_adult: "false",
        include_video: "false",
        page: 1,
        "primary_release_date.lte": today(),
        region: config().tmdbRegion || "US",
        sort_by: "primary_release_date.desc",
        "vote_count.gte": 5,
      });

      if (!data) {
        return fallbackFeed("movie", limit);
      }

      return {
        items: (data.results || [])
          .map((item) => mapTmdbTitle(item, "movie"))
          .filter((item) => item.poster || item.backdrop)
          .slice(0, limit),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return fallbackFeed("movie", limit);
    }
  }

  async function getNewestTitles({
    mediaType = "movie",
    page = 1,
    limit = 24,
    genre = "",
    year = "",
  } = {}) {
    if (!["movie", "tv"].includes(mediaType))
      throw new Error("Invalid catalog type.");
    const selectedGenre = GENRES.find((item) => item.slug === genre);
    const data = await tmdbFetch(
      `discover/${mediaType}`,
      {
        include_adult: false,
        page,
        "vote_count.gte": 5,
        ...(selectedGenre
          ? {
              with_genres:
                selectedGenre[
                  mediaType === "tv" ? "tvGenreIds" : "movieGenreIds"
                ].join("|"),
            }
          : {}),
        ...(mediaType === "movie"
          ? {
              include_video: false,
              "primary_release_date.lte": today(),
              sort_by: "primary_release_date.desc",
              region: config().tmdbRegion || "US",
              ...(year ? { primary_release_year: year } : {}),
            }
          : {
              include_null_first_air_dates: false,
              "first_air_date.lte": today(),
              sort_by: "first_air_date.desc",
              ...(year ? { first_air_date_year: year } : {}),
            }),
      },
      { timeoutMs: 10000 },
    );
    if (!data) throw new Error("The catalog is unavailable.");
    return {
      items: (data.results || [])
        .filter((item) => !item.adult)
        .map((item) => mapTmdbTitle(item, mediaType))
        .filter((item) => item.poster || item.backdrop)
        .slice(0, limit),
      page,
      totalPages: Math.min(500, data.total_pages || 1),
    };
  }

  async function getNewestSeries(limit = PAGE_SIZE) {
    try {
      const data = await tmdbFetch("discover/tv", {
        include_adult: "false",
        include_null_first_air_dates: "false",
        page: 1,
        "first_air_date.lte": today(),
        sort_by: "first_air_date.desc",
        "vote_count.gte": 5,
      });

      if (!data) {
        return fallbackFeed("tv", limit);
      }

      return {
        items: (data.results || [])
          .map((item) => mapTmdbTitle(item, "tv"))
          .filter((item) => item.poster || item.backdrop)
          .slice(0, limit),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return fallbackFeed("tv", limit);
    }
  }

  async function getTrendingMovies(limit = PAGE_SIZE) {
    try {
      const data = await tmdbFetch("trending/movie/week", { page: 1 });

      if (!data) {
        return fallbackFeed("movie", limit);
      }

      return {
        items: (data.results || [])
          .filter((item) => !item.adult)
          .map((item) => mapTmdbTitle(item, "movie"))
          .filter((item) => item.backdrop || item.poster)
          .slice(0, limit),
        source: "tmdb",
      };
    } catch (error) {
      console.warn(error);
      return fallbackFeed("movie", limit);
    }
  }

  async function getTrendingKdramas(limit = PAGE_SIZE) {
    const pages = await Promise.all(
      [1, 2, 3].map((page) => tmdbFetch("trending/tv/week", { page })),
    );
    return uniqueTitles(
      pages
        .flatMap((page) =>
          (page?.results || []).filter(
            (item) =>
              !item.adult &&
              item.original_language === "ko" &&
              item.genre_ids?.includes(18),
          ),
        )
        .map((item) => mapTmdbTitle(item, "tv")),
      limit,
    );
  }

  function animeDate(offset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  const ANIME_GENRES = GENRES.filter((genre) =>
    [
      "action-adventure",
      "comedy",
      "crime",
      "drama",
      "family",
      "fantasy-scifi",
      "history",
      "horror",
      "kids",
      "music",
      "mystery",
      "romance-soap",
      "thriller",
      "war-politics",
    ].includes(genre.slug),
  )
    .map((genre) =>
      genre.slug === "romance-soap" ? { ...genre, name: "Romance" } : genre,
    )
    .concat([
      {
        slug: "slice-of-life",
        name: "Slice of Life",
        keywords: ["slice of life"],
      },
      { slug: "isekai", name: "Isekai", keywords: ["isekai"] },
      { slug: "mecha", name: "Mecha", keywords: ["mecha"] },
      { slug: "school", name: "School", keywords: ["school life", "school"] },
      { slug: "sports", name: "Sports", keywords: ["sports"] },
      { slug: "shounen", name: "Shounen", keywords: ["shounen", "shonen"] },
      { slug: "shoujo", name: "Shoujo", keywords: ["shoujo", "shojo"] },
      {
        slug: "boys-love",
        name: "Boys' Love (Yaoi)",
        keywords: ["boys' love (bl)", "boys love", "yaoi"],
      },
      {
        slug: "girls-love",
        name: "Girls' Love (Yuri)",
        keywords: ["girls' love (gl)", "girls love", "yuri"],
      },
    ]);

  const EXPLICIT_ANIME_KEYWORDS = [
    "hentai",
    "pornography",
    "pornographic animation",
  ];

  async function animeKeywordIds(names) {
    const results = await Promise.all(
      names.map(async (name) => {
        const feed = await tmdbFetch("search/keyword", { query: name });
        if (!feed) throw new Error("Anime categories are unavailable.");
        return (feed.results || [])
          .filter((item) => item.name?.toLowerCase() === name)
          .map((item) => item.id);
      }),
    );
    return [...new Set(results.flat())];
  }

  function safeAnime(item) {
    const keywords = item.keywords?.keywords || item.keywords?.results || [];
    return (
      !item.adult &&
      !keywords.some((keyword) =>
        EXPLICIT_ANIME_KEYWORDS.includes(keyword.name?.toLowerCase()),
      ) &&
      !/\b(hentai|pornographic)\b/i.test(
        `${item.title || item.name || ""} ${item.original_title || item.original_name || ""}`,
      )
    );
  }

  async function filterAnimeTitles(items, type) {
    const checked = await Promise.all(
      items.filter(safeAnime).map(async (item) => {
        const details = await tmdbFetch(
          `${type || item.media_type}/${item.id}`,
          { append_to_response: "keywords" },
        );
        return details && safeAnime(details) ? item : null;
      }),
    );
    return checked.filter(Boolean);
  }

  async function getAnimeBrowse({
    genre,
    page = 1,
    year,
    limit = PAGE_SIZE,
  } = {}) {
    const selectedGenre = ANIME_GENRES.find((item) => item.slug === genre);
    const excluded = await animeKeywordIds(EXPLICIT_ANIME_KEYWORDS);
    const included = selectedGenre?.keywords
      ? await animeKeywordIds(selectedGenre.keywords)
      : [];
    if (selectedGenre?.keywords && !included.length)
      return { items: [], page, totalPages: 1 };
    const requests = ["movie", "tv"].flatMap((type) => {
      const ids =
        selectedGenre && !selectedGenre.keywords
          ? selectedGenre[type === "movie" ? "movieGenreIds" : "tvGenreIds"]
          : [null];
      return ids.map(async (id) => {
        const params = {
          page,
          sort_by: "popularity.desc",
          with_original_language: "ja",
          with_genres: id ? `16,${id}` : "16",
          include_adult: false,
          without_keywords: excluded.join(","),
          ...(included.length ? { with_keywords: included.join("|") } : {}),
        };
        if (year)
          params[
            type === "movie" ? "primary_release_year" : "first_air_date_year"
          ] = year;
        const feed = await tmdbFetch(`discover/${type}`, params);
        if (!feed) throw new Error("Anime catalog is unavailable.");
        return {
          ...feed,
          results: await filterAnimeTitles(feed.results || [], type),
          type,
        };
      });
    });
    const feeds = await Promise.all(requests);
    const items = uniqueTitles(
      feeds.flatMap((feed) =>
        (feed.results || [])
          .filter(
            (item) =>
              safeAnime(item) &&
              item.original_language === "ja" &&
              item.genre_ids?.includes(16),
          )
          .map((item) => ({
            ...mapTmdbTitle(item, feed.type),
            popularity: item.popularity || 0,
          })),
      ),
    )
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, limit);
    return {
      items,
      page,
      totalPages: Math.min(
        500,
        Math.max(1, ...feeds.map((feed) => feed.total_pages || 1)),
      ),
    };
  }

  async function getAnimeFeed(kind, limit = PAGE_SIZE) {
    if (kind === "trending") {
      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map((page) => tmdbFetch("trending/all/week", { page })),
      );
      if (!pages.some(Boolean))
        throw new Error("Anime catalog is unavailable.");
      const candidates = pages.flatMap((page) =>
        (page?.results || []).filter(
          (item) =>
            safeAnime(item) &&
            item.original_language === "ja" &&
            item.genre_ids?.includes(16),
        ),
      );
      const checked = await filterAnimeTitles([
        ...new Map(
          candidates.map((item) => [`${item.media_type}:${item.id}`, item]),
        ).values(),
      ]);
      return uniqueTitles(
        checked.map((item) => mapTmdbTitle(item, item.media_type)),
        limit,
      );
    }
    const today = animeDate();
    const params = {
      with_genres: 16,
      with_original_language: "ja",
      include_adult: "false",
      without_keywords: (await animeKeywordIds(EXPLICIT_ANIME_KEYWORDS)).join(
        ",",
      ),
      include_null_first_air_dates: "false",
      sort_by: kind === "new" ? "first_air_date.desc" : "popularity.desc",
      ...(kind === "new"
        ? { "first_air_date.gte": animeDate(-90), "first_air_date.lte": today }
        : {
            "air_date.gte": kind === "recent" ? animeDate(-14) : today,
            "air_date.lte": kind === "recent" ? today : animeDate(7),
          }),
    };
    const pageCount =
      kind === "schedule" ? 1 : Math.min(3, Math.ceil(limit / 20));
    const pages = await Promise.all(
      Array.from({ length: pageCount }, (_, index) =>
        tmdbFetch("discover/tv", { ...params, page: index + 1 }),
      ),
    );
    if (!pages.some(Boolean)) throw new Error("Anime catalog is unavailable.");
    const data = {
      results: [
        ...new Map(
          pages
            .flatMap((page) => page?.results || [])
            .filter(
              (item) =>
                safeAnime(item) &&
                item.original_language === "ja" &&
                item.genre_ids?.includes(16),
            )
            .map((item) => [item.id, item]),
        ).values(),
      ],
    };
    if (!data) throw new Error("Anime catalog is unavailable.");
    if (kind === "new")
      return (await filterAnimeTitles(data.results || [], "tv"))
        .slice(0, limit)
        .map((item) => mapTmdbTitle(item, "tv"));
    const details = await Promise.allSettled(
      (data.results || [])
        .slice(0, Math.max(20, limit))
        .map((item) =>
          tmdbFetch(`tv/${item.id}`, { append_to_response: "keywords" }),
        ),
    );
    if (
      details.length &&
      details.every((result) => result.status === "rejected" || !result.value)
    ) {
      throw new Error("Episode dates are unavailable.");
    }
    return details
      .flatMap((result) => {
        if (result.status !== "fulfilled" || !result.value) return [];
        const title = result.value;
        if (!safeAnime(title)) return [];
        const episode =
          kind === "recent"
            ? title.last_episode_to_air
            : title.next_episode_to_air;
        if (
          !episode?.air_date ||
          episode.season_number < 1 ||
          episode.episode_number < 1
        )
          return [];
        const lower = kind === "recent" ? animeDate(-14) : today;
        const upper = kind === "recent" ? today : animeDate(7);
        if (episode.air_date < lower || episode.air_date > upper) return [];
        const item = mapTmdbTitle(title, "tv");
        return [
          {
            ...item,
            episodeDate: episode.air_date,
            episodeTitle: episode.name || "",
            season: episode.season_number,
            episode: episode.episode_number,
            resumeLabel: `S${episode.season_number} E${episode.episode_number}`,
            detailPath: `/title/tv/${title.id}?season=${episode.season_number}&episode=${episode.episode_number}`,
          },
        ];
      })
      .sort((a, b) =>
        kind === "recent"
          ? b.episodeDate.localeCompare(a.episodeDate)
          : a.episodeDate.localeCompare(b.episodeDate),
      )
      .slice(0, limit);
  }

  async function getPersonTitles(personId, limit = Number.POSITIVE_INFINITY) {
    const cleanId = String(personId || "").trim();

    if (!/^\d+$/.test(cleanId)) {
      return [];
    }

    try {
      const data = await tmdbFetch(`person/${cleanId}`, {
        append_to_response: "combined_credits",
      });
      const credits =
        data?.combined_credits ||
        (await tmdbFetch(`person/${cleanId}/combined_credits`));

      if (!credits) {
        return [];
      }

      return uniqueTitles(
        mapRelatedTitles([...(credits.cast || []), ...(credits.crew || [])]),
        limit,
      );
    } catch (error) {
      console.warn("RainFlix could not load this person's credits:", error);
      return [];
    }
  }

  async function getCompanyTitles(companyId, limit = 120) {
    const cleanId = String(companyId || "").trim();

    if (!/^\d+$/.test(cleanId)) {
      return [];
    }

    try {
      const pageCount = Math.min(
        3,
        Math.max(1, Math.ceil(Math.max(1, Number(limit) || 120) / 40)),
      );
      const requests = [];

      for (let page = 1; page <= pageCount; page += 1) {
        requests.push(
          tmdbFetch("discover/movie", {
            include_adult: "false",
            include_video: "false",
            page,
            sort_by: "popularity.desc",
            with_companies: cleanId,
          }),
          tmdbFetch("discover/tv", {
            include_adult: "false",
            include_null_first_air_dates: "false",
            page,
            sort_by: "popularity.desc",
            with_companies: cleanId,
          }),
        );
      }

      const feeds = await Promise.allSettled(requests);
      const titles = feeds.flatMap((feed, index) =>
        mapRelatedTitles(
          feed.status === "fulfilled" ? feed.value?.results || [] : [],
          index % 2 === 0 ? "movie" : "tv",
        ),
      );

      return uniqueTitles(titles, limit);
    } catch (error) {
      console.warn("RainFlix could not load this company's titles:", error);
      return [];
    }
  }

  async function search(query, limit = 12, page = 1, paginated = false) {
    const cleanQuery = String(query || "").trim();

    if (cleanQuery.length < 2) {
      return [];
    }

    let tmdbResults = [];
    let totalPages = 1;

    try {
      const [data, companyData] = await Promise.all([
        tmdbFetch("search/multi", {
          query: cleanQuery,
          page,
          include_adult: "false",
        }),
        tmdbFetch("search/company", {
          query: cleanQuery,
          page,
        }).catch(() => ({ results: [] })),
      ]);

      if (!data) {
        const loweredQuery = cleanQuery.toLowerCase();
        tmdbResults = FALLBACK_TITLES.filter((item) =>
          `${item.title} ${mediaLabel(item.mediaType)} ${item.year}`
            .toLowerCase()
            .includes(loweredQuery),
        );
      } else {
        totalPages = Math.min(500, data.total_pages || 1);
        const directTitles = (data.results || [])
          .filter(
            (item) => item.media_type === "movie" || item.media_type === "tv",
          )
          .map((item) => mapTmdbTitle(item))
          .filter((item) => item.poster || item.backdrop);
        const people = (data.results || [])
          .filter((item) => item.media_type === "person")
          .sort(
            (left, right) =>
              relationshipScore(right, cleanQuery) -
              relationshipScore(left, cleanQuery),
          );
        const companies = (companyData?.results || []).sort(
          (left, right) =>
            relationshipScore(right, cleanQuery) -
            relationshipScore(left, cleanQuery),
        );
        const knownFor = people
          .slice(0, 3)
          .flatMap((person) => person.known_for || [])
          .filter(
            (item) => item.media_type === "movie" || item.media_type === "tv",
          )
          .map((item) => mapTmdbTitle(item))
          .filter((item) => item.poster || item.backdrop);
        const relatedRequests = [];

        if (page === 1 && relationshipScore(people[0], cleanQuery) > 0) {
          relatedRequests.push(getPersonTitles(people[0].id, limit));
        }

        if (page === 1 && relationshipScore(companies[0], cleanQuery) > 0) {
          relatedRequests.push(getCompanyTitles(companies[0].id, limit));
        }

        const relatedTitles = (await Promise.all(relatedRequests)).flat();
        tmdbResults = uniqueTitles(
          [...directTitles, ...knownFor, ...relatedTitles],
          limit,
        );
      }
    } catch (error) {
      console.warn(error);
    }

    return paginated
      ? { items: tmdbResults.slice(0, limit), page, totalPages }
      : tmdbResults.slice(0, limit);
  }

  async function getDetailsByImdb(mediaType, imdbId) {
    if (!["movie", "tv"].includes(mediaType) || !/^tt\d+$/.test(imdbId))
      return null;
    const found = await tmdbFetch(`find/${imdbId}`, {
      external_source: "imdb_id",
    });
    const match = (
      mediaType === "tv" ? found?.tv_results : found?.movie_results
    )?.[0];
    if (!match?.id) return null;
    const data = await tmdbFetch(`${mediaType}/${match.id}`, {
      append_to_response: "external_ids,images,credits,videos",
      include_image_language: "en,null",
    });
    return data ? mapTmdbDetails(data, mediaType) : null;
  }

  async function getDetails(mediaType, id) {
    const normalizedType = normalizeMediaType(mediaType);

    try {
      const data = await tmdbFetch(`${normalizedType}/${id}`, {
        append_to_response: "external_ids,images,credits,videos",
        include_image_language: "en,null",
      });

      if (data) {
        return mapTmdbDetails(data, normalizedType);
      }
    } catch (error) {
      console.warn(error);
    }

    const fallback = FALLBACK_TITLES.find(
      (item) =>
        String(item.id) === String(id) && item.mediaType === normalizedType,
    );

    return fallback ? mapFallbackDetails(fallback) : null;
  }

  async function getWatchProviders(mediaType, id) {
    if (!/^[1-9]\d*$/.test(String(id))) return {};
    const data = await tmdbFetch(
      `${normalizeMediaType(mediaType)}/${id}/watch/providers`,
      {},
      { persist: false, cache: "no-store" },
    );
    if (!data)
      throw new Error("TMDb availability requires configured credentials.");
    return data.results || {};
  }

  async function getSimilar(mediaType, id, limit = PAGE_SIZE) {
    const normalizedType = normalizeMediaType(mediaType);

    try {
      const data = await tmdbFetch(`${normalizedType}/${id}/similar`, {
        page: 1,
      });

      if (data) {
        return {
          items: (data.results || [])
            .map((item) => mapTmdbTitle(item, normalizedType))
            .filter(
              (item) =>
                String(item.id) !== String(id) &&
                (item.poster || item.backdrop),
            )
            .slice(0, limit),
          source: "tmdb",
        };
      }
    } catch (error) {
      console.warn(error);
    }

    return {
      items: fallbackItems(normalizedType)
        .filter((item) => String(item.id) !== String(id))
        .slice(0, limit),
      source: "demo",
    };
  }

  async function getRecommendationProfile(mediaType, id) {
    if (!["movie", "tv"].includes(mediaType) || !/^[1-9]\d*$/.test(String(id)))
      throw new Error("Invalid recommendation title.");
    const data = await tmdbFetch(
      `${mediaType}/${id}`,
      { append_to_response: "keywords,credits" },
      { timeoutMs: 10000 },
    );
    if (!data?.id) throw new Error("Title metadata is unavailable.");
    const crew = data.credits?.crew || [];
    return {
      ...mapTmdbTitle(data, mediaType),
      synopsis: data.overview || "",
      genreIds: (data.genres || []).map((genre) => genre.id),
      tagline: data.tagline || "",
      adult: data.adult === true,
      keywords: data.keywords?.keywords || data.keywords?.results || [],
      companies: data.production_companies || [],
      cast: (data.credits?.cast || []).slice(0, 12),
      crew: crew
        .filter((person) =>
          [
            "Director",
            "Writer",
            "Screenplay",
            "Creator",
            "Executive Producer",
          ].includes(person.job),
        )
        .slice(0, 24),
      directors: [
        ...crew.filter((person) => person.job === "Director"),
        ...(data.created_by || []),
      ],
    };
  }

  async function getRecommendationCandidates(profile, page = 1) {
    const type = profile.mediaType;
    const discovery = {
      page,
      include_adult: false,
      sort_by: "vote_count.desc",
      "vote_count.gte": type === "tv" ? 10 : 20,
    };
    const queries = [
      [`${type}/${profile.id}/recommendations`, { page }, true],
      [`${type}/${profile.id}/similar`, { page }, true],
    ];
    if (profile.keywords?.length)
      queries.push([
        `discover/${type}`,
        {
          ...discovery,
          with_keywords: profile.keywords
            .slice(0, 5)
            .map((item) => item.id)
            .join("|"),
        },
      ]);
    if (profile.companies?.length)
      queries.push([
        `discover/${type}`,
        {
          ...discovery,
          with_companies: profile.companies
            .slice(0, 3)
            .map((item) => item.id)
            .join("|"),
        },
      ]);
    if (profile.genreIds?.length)
      queries.push([
        `discover/${type}`,
        {
          ...discovery,
          with_genres: profile.genreIds.slice(0, 3).join("|"),
          ...(profile.originalLanguage
            ? { with_original_language: profile.originalLanguage }
            : {}),
        },
      ]);
    const responses = await Promise.allSettled(
      queries.map(async ([path, params, seed]) => {
        const data = await tmdbFetch(path, params, { timeoutMs: 10000 });
        if (!data) throw new Error("Recommendations are unavailable.");
        return {
          items: (data.results || [])
            .filter((item) => !item.adult)
            .map((item) => ({
              ...mapTmdbTitle(item, type),
              synopsis: item.overview || "",
              recommendationSeed: Boolean(seed),
            })),
          hasMore: page < (data.total_pages || 1),
        };
      }),
    );
    const successful = responses
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (!successful.length)
      throw new Error("Recommendations could not be loaded.");
    return {
      items: uniqueTitles(successful.flatMap((result) => result.items)).filter(
        (item) =>
          String(item.id) !== String(profile.id) &&
          (item.poster || item.backdrop),
      ),
      hasMore: successful.some((result) => result.hasMore),
    };
  }

  async function getEpisodeGroups(id) {
    const data = await tmdbFetch(`tv/${id}/episode_groups`);
    return (Array.isArray(data?.results) ? data.results : []).filter(
      (group) =>
        typeof group.id === "string" && /^[a-f\d]{24}$/i.test(group.id),
    );
  }

  async function getEpisodeGroup(id) {
    if (!/^[a-f\d]{24}$/i.test(String(id)))
      throw new Error("Invalid TMDb episode group.");
    const data = await tmdbFetch(`tv/episode_group/${id}`);
    const seasons = (Array.isArray(data?.groups) ? data.groups : [])
      .filter((group) => Number.isInteger(group.order) && group.order > 0)
      .map((group) => ({
        seasonNumber: group.order,
        name: group.name || `Season ${group.order}`,
        episodes: (Array.isArray(group.episodes) ? group.episodes : [])
          .filter(
            (episode) =>
              Number.isInteger(episode.season_number) &&
              Number.isInteger(episode.episode_number),
          )
          .sort(
            (a, b) =>
              (a.order ?? a.episode_number) - (b.order ?? b.episode_number),
          )
          .map((episode, index) => ({
            episodeNumber: index + 1,
            sourceSeasonNumber: episode.season_number,
            sourceEpisodeNumber: episode.episode_number,
            title: episode.name || `Episode ${index + 1}`,
            image: imageUrl(episode.still_path, "w500"),
            releaseDate: episode.air_date || "",
          })),
      }))
      .filter((season) => season.episodes.length)
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
    if (!seasons.length) throw new Error("TMDb has no usable grouped seasons.");
    return seasons;
  }

  async function getSeasonDetails(id, seasonNumber = 1, options = {}) {
    const cleanSeason = Number.parseInt(seasonNumber, 10) || 1;

    try {
      const data = await tmdbFetch(`tv/${id}/season/${cleanSeason}`);

      if (data) {
        return {
          seasonNumber: data.season_number,
          name: data.name || `Season ${cleanSeason}`,
          synopsis: data.overview || "",
          episodes: (data.episodes || []).map((episode) => ({
            episodeNumber: episode.episode_number,
            title: episode.name || `Episode ${episode.episode_number}`,
            runtime: episode.runtime ? `${episode.runtime} min` : "",
            rating: episode.vote_average
              ? Number(episode.vote_average).toFixed(1)
              : "NR",
            image: imageUrl(episode.still_path, "w500"),
            releaseDate: episode.air_date || "",
            synopsis: episode.overview || "No episode synopsis available yet.",
          })),
        };
      }
    } catch (error) {
      console.warn(error);
    }

    if (options.strict)
      throw new Error("TMDb could not load this season. Try again.");
    const fallback = FALLBACK_TITLES.find(
      (item) => String(item.id) === String(id) && item.mediaType === "tv",
    );
    const seasonCount = fallback?.seasons || 1;
    const totalEpisodes = fallback?.episodeCount || 8;
    const count = Math.max(1, Math.ceil(totalEpisodes / seasonCount));

    return {
      seasonNumber: cleanSeason,
      name: `Season ${cleanSeason}`,
      synopsis: fallback?.synopsis || "",
      episodes: Array.from({ length: count }, (_, index) => ({
        episodeNumber: index + 1,
        title: `Episode ${index + 1}`,
        runtime: "",
        rating: "NR",
        image: fallback?.backdrop || fallback?.poster || "",
        synopsis: `${fallback?.title || "This series"} continues with episode ${index + 1} of season ${cleanSeason}.`,
      })),
    };
  }

  function buildWatchUrl(item, season = 1, episode = 1) {
    const mediaType = normalizeMediaType(item.mediaType);

    if (mediaType === "tv") {
      return `#watch/tv/${encodeURIComponent(item.id)}/${season}/${episode}`;
    }

    return `#watch/movie/${encodeURIComponent(item.id)}`;
  }

  window.RainFlixApi = {
    GENRES,
    PAGE_SIZE,
    buildWatchUrl,
    createImageFallback,
    escapeHtml,
    getDetails,
    getAnimeFeed,
    getAnimeBrowse,
    ANIME_GENRES,
    getDetailsByImdb,
    getGenre,
    getGenreTitles,
    getCompanyTitles,
    getLoaderPosters,
    getNewestMovies,
    getNewestTitles,
    getNewestSeries,
    getPersonTitles,
    getSeasonDetails,
    getEpisodeGroup,
    getEpisodeGroups,
    getSimilar,
    getRecommendationProfile,
    getRecommendationCandidates,
    getWatchProviders,
    getTitleLogos,
    getTrending,
    getTrendingThisWeek,
    getTrendingMovies,
    getTrendingKdramas,
    getYearTitles,
    hasTmdbCredentials,
    mediaLabel,
    normalizeMediaType,
    search,
    searchPage: (query, page = 1, limit = 20) =>
      search(query, limit, page, true),
  };
})();
