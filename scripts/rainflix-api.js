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
      poster: imageUrl(item.poster_path, "w500"),
      backdrop:
        imageUrl(item.backdrop_path, "w1280") ||
        imageUrl(item.poster_path, "w780"),
      genreIds: Array.isArray(item.genre_ids) ? item.genre_ids : [],
      synopsis: item.overview || "No synopsis available yet.",
    };
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
      cast: (item.credits?.cast || []).slice(0, 10).map((person) => ({
        id: person.id,
        name: person.name || "Unknown cast member",
        character: person.character || "",
        image: imageUrl(person.profile_path, "w185"),
      })),
      trailerKey: preferredTrailer(item.videos),
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
            params["primary_release_date.lte"] = today();
            params.region = config().tmdbRegion || "US";
          } else {
            params.include_null_first_air_dates = "false";
            params["first_air_date.lte"] = today();
          }

          return {
            data: await tmdbFetch(`discover/${mediaType}`, params),
            mediaType,
          };
        }),
      );

      if (responses.every(({ data }) => !data)) {
        return fallbackPage(normalizedFilter, page, limit);
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
      return fallbackPage(normalizedFilter, page, limit);
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

  async function search(query, limit = 12) {
    const cleanQuery = String(query || "").trim();

    if (cleanQuery.length < 2) {
      return [];
    }

    let tmdbResults = [];

    try {
      const data = await tmdbFetch("search/multi", {
        query: cleanQuery,
        page: 1,
        include_adult: "false",
      });

      if (!data) {
        const loweredQuery = cleanQuery.toLowerCase();
        tmdbResults = FALLBACK_TITLES.filter((item) =>
          `${item.title} ${mediaLabel(item.mediaType)} ${item.year}`
            .toLowerCase()
            .includes(loweredQuery),
        );
      } else {
        tmdbResults = (data.results || [])
          .filter(
            (item) => item.media_type === "movie" || item.media_type === "tv",
          )
          .map((item) => mapTmdbTitle(item))
          .filter((item) => item.poster || item.backdrop);
      }
    } catch (error) {
      console.warn(error);
    }

    return tmdbResults.slice(0, limit);
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

  async function getSeasonDetails(id, seasonNumber = 1) {
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
            synopsis: episode.overview || "No episode synopsis available yet.",
          })),
        };
      }
    } catch (error) {
      console.warn(error);
    }

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

  function cleanBaseUrl(value) {
    return String(value || "").replace(/\/+$/, "");
  }

  function buildUrlWithQuery(baseUrl, params = {}) {
    const url = new URL(cleanBaseUrl(baseUrl));

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, value);
      }
    });

    return url.toString();
  }

  function twoEmbedMovieBaseUrl(value) {
    const baseUrl = cleanBaseUrl(value || "https://www.2embed.cc/embed");

    if (/\/embed$/i.test(baseUrl)) {
      return baseUrl;
    }

    if (/\/embedtv$/i.test(baseUrl)) {
      return baseUrl.replace(/\/embedtv$/i, "/embed");
    }

    return `${baseUrl}/embed`;
  }

  function twoEmbedTvBaseUrl(value) {
    const baseUrl = cleanBaseUrl(value || "https://www.2embed.cc/embed");

    if (/\/embedtv$/i.test(baseUrl)) {
      return baseUrl;
    }

    if (/\/embed$/i.test(baseUrl)) {
      return baseUrl.replace(/\/embed$/i, "/embedtv");
    }

    return `${baseUrl}/embedtv`;
  }

  function buildMultiEmbedUrl({
    mediaType,
    id,
    season = 1,
    episode = 1,
    baseUrl,
  }) {
    const normalizedType = normalizeMediaType(mediaType);
    const params = {
      video_id: id,
      tmdb: 1,
    };

    if (normalizedType === "tv") {
      params.s = Number.parseInt(season, 10) || 1;
      params.e = Number.parseInt(episode, 10) || 1;
    }

    return buildUrlWithQuery(baseUrl, params);
  }

  function buildVidLinkUrl({
    mediaType,
    id,
    season = 1,
    episode = 1,
    baseUrl,
  }) {
    const normalizedType = normalizeMediaType(mediaType);
    const cleanBase = cleanBaseUrl(baseUrl || "https://vidlink.pro");
    const cleanSeason = Number.parseInt(season, 10) || 1;
    const cleanEpisode = Number.parseInt(episode, 10) || 1;

    if (normalizedType === "tv") {
      return `${cleanBase}/tv/${encodeURIComponent(id)}/${cleanSeason}/${cleanEpisode}`;
    }

    return `${cleanBase}/movie/${encodeURIComponent(id)}`;
  }

  function buildPathPlayerUrl({
    mediaType,
    id,
    season = 1,
    episode = 1,
    baseUrl,
    params = {},
  }) {
    const normalizedType = normalizeMediaType(mediaType);
    const cleanBase = cleanBaseUrl(baseUrl);
    const cleanSeason = Number.parseInt(season, 10) || 1;
    const cleanEpisode = Number.parseInt(episode, 10) || 1;
    const path =
      normalizedType === "tv"
        ? `${cleanBase}/tv/${encodeURIComponent(id)}/${cleanSeason}/${cleanEpisode}`
        : `${cleanBase}/movie/${encodeURIComponent(id)}`;

    return buildUrlWithQuery(path, params);
  }

  function buildVidFastUrl(options) {
    const normalizedType = normalizeMediaType(options.mediaType);
    const params = {
      autoPlay: "true",
      theme: "38BDF8",
      fullscreenButton: "true",
      sub: "en",
    };

    if (normalizedType === "tv") {
      params.nextButton = "true";
      params.autoNext = "true";
    }

    return buildPathPlayerUrl({ ...options, params });
  }

  function buildVidSrcMeUrl({
    mediaType,
    id,
    season = 1,
    episode = 1,
    baseUrl,
  }) {
    const normalizedType = normalizeMediaType(mediaType);
    const cleanBase = cleanBaseUrl(baseUrl);
    const cleanSeason = Number.parseInt(season, 10) || 1;
    const cleanEpisode = Number.parseInt(episode, 10) || 1;
    const path =
      normalizedType === "tv"
        ? `${cleanBase}/tv/${encodeURIComponent(id)}/${cleanSeason}-${cleanEpisode}`
        : `${cleanBase}/movie/${encodeURIComponent(id)}`;

    return buildUrlWithQuery(path, {
      autoplay: 1,
      autonext: normalizedType === "tv" ? 1 : undefined,
      ds_lang: "en",
    });
  }

  function buildVidCoreUrl(options) {
    return buildPathPlayerUrl({
      ...options,
      params: {
        autoPlay: "true",
        theme: "38BDF8",
        fullscreenButton: "true",
        sub: "en",
      },
    });
  }

  function streamSources(mediaType = "movie") {
    const normalizedType = normalizeMediaType(mediaType);
    const sources = [
      {
        id: "vidsrc",
        label: "VidSrc",
        baseUrl: cleanBaseUrl(
          config().vidsrcEmbedBaseUrl || "https://vidsrc.to/embed",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "2embed",
        label: "2embed",
        baseUrl: cleanBaseUrl(
          config().twoEmbedBaseUrl || "https://www.2embed.cc/embed",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "multiembed",
        label: "MultiEmbed",
        baseUrl: cleanBaseUrl(
          config().multiEmbedBaseUrl || "https://multiembed.mov",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "vidlink",
        label: "VidLink",
        baseUrl: cleanBaseUrl(
          config().vidlinkEmbedBaseUrl || "https://vidlink.pro",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "vidfast",
        label: "VidFast",
        baseUrl: cleanBaseUrl(
          config().vidfastEmbedBaseUrl || "https://vidfast.vc",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "vidsrcme",
        label: "VidSrcMe",
        baseUrl: cleanBaseUrl(
          config().vidsrcMeEmbedBaseUrl || "https://vidsrc-embed.ru/embed",
        ),
        mediaTypes: ["movie", "tv"],
      },
      {
        id: "vidcore",
        label: "VidCore",
        baseUrl: cleanBaseUrl(
          config().vidcoreEmbedBaseUrl || "https://vidcore.org/embed",
        ),
        mediaTypes: ["movie", "tv"],
      },
    ];

    return sources.filter((source) =>
      source.mediaTypes.includes(normalizedType),
    );
  }

  function buildStreamUrl({
    mediaType,
    id,
    season = 1,
    episode = 1,
    source = "vidsrc",
  }) {
    const streamSource =
      streamSources(mediaType).find((item) => item.id === source) ||
      streamSources(mediaType)[0];
    const normalizedType = normalizeMediaType(mediaType);
    const cleanSeason = Number.parseInt(season, 10) || 1;
    const cleanEpisode = Number.parseInt(episode, 10) || 1;

    if (streamSource.id === "2embed") {
      if (normalizedType === "tv") {
        return `${twoEmbedTvBaseUrl(streamSource.baseUrl)}/${encodeURIComponent(id)}&s=${cleanSeason}&e=${cleanEpisode}`;
      }

      return `${twoEmbedMovieBaseUrl(streamSource.baseUrl)}/${encodeURIComponent(id)}`;
    }

    if (streamSource.id === "multiembed") {
      return buildMultiEmbedUrl({
        mediaType: normalizedType,
        id,
        season: cleanSeason,
        episode: cleanEpisode,
        baseUrl: streamSource.baseUrl,
      });
    }

    if (streamSource.id === "vidlink") {
      return buildVidLinkUrl({
        mediaType: normalizedType,
        id,
        season: cleanSeason,
        episode: cleanEpisode,
        baseUrl: streamSource.baseUrl,
      });
    }

    if (streamSource.id === "vidfast") {
      return buildVidFastUrl({
        mediaType: normalizedType,
        id,
        season: cleanSeason,
        episode: cleanEpisode,
        baseUrl: streamSource.baseUrl,
      });
    }

    if (streamSource.id === "vidsrcme") {
      return buildVidSrcMeUrl({
        mediaType: normalizedType,
        id,
        season: cleanSeason,
        episode: cleanEpisode,
        baseUrl: streamSource.baseUrl,
      });
    }

    if (streamSource.id === "vidcore") {
      return buildVidCoreUrl({
        mediaType: normalizedType,
        id,
        season: cleanSeason,
        episode: cleanEpisode,
        baseUrl: streamSource.baseUrl,
      });
    }

    if (normalizedType === "tv") {
      return `${streamSource.baseUrl}/tv/${encodeURIComponent(id)}/${cleanSeason}/${cleanEpisode}`;
    }

    return `${streamSource.baseUrl}/movie/${encodeURIComponent(id)}`;
  }

  function buildStreamSources(params) {
    return streamSources(params.mediaType).map((source) => ({
      ...source,
      url: buildStreamUrl({ ...params, source: source.id }),
    }));
  }

  window.RainFlixApi = {
    GENRES,
    PAGE_SIZE,
    buildStreamSources,
    buildStreamUrl,
    buildWatchUrl,
    createImageFallback,
    escapeHtml,
    getDetails,
    getGenre,
    getGenreTitles,
    getLoaderPosters,
    getNewestMovies,
    getNewestSeries,
    getSeasonDetails,
    getSimilar,
    getTitleLogos,
    getTrending,
    getTrendingThisWeek,
    getTrendingMovies,
    getYearTitles,
    hasTmdbCredentials,
    mediaLabel,
    normalizeMediaType,
    search,
  };
})();
