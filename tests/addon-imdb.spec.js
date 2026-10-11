import { expect, test } from "@playwright/test";

test("automatic TMDb episode groups split seasons and preserve original coordinates", async ({
  page,
}) => {
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.route(
    "https://api.themoviedb.org/3/tv/220542/episode_groups?*",
    (route) =>
      route.fulfill({
        json: {
          results: [
            {
              id: "6782169d78cfcd77ed4e89be",
              type: 6,
              name: "Seasons",
              group_count: 3,
            },
          ],
        },
      }),
  );
  await page.route(
    "https://api.themoviedb.org/3/tv/episode_group/6782169d78cfcd77ed4e89be?*",
    (route) =>
      route.fulfill({
        json: {
          groups: [
            {
              order: 2,
              name: "Season 2",
              episodes: [
                {
                  order: 1,
                  season_number: 1,
                  episode_number: 26,
                  name: "Second",
                  still_path: "/second.jpg",
                },
                {
                  order: 0,
                  season_number: 1,
                  episode_number: 25,
                  name: "Premiere",
                  air_date: "2025-01-10",
                },
              ],
            },
            {
              order: 0,
              name: "Specials",
              episodes: [{ season_number: 0, episode_number: 1 }],
            },
            {
              order: 1,
              name: "Season 1",
              episodes: Array.from({ length: 24 }, (_, index) => ({
                order: index,
                season_number: 1,
                episode_number: index + 1,
                name: index === 0 ? "First" : `Episode ${index + 1}`,
              })),
            },
          ],
        },
      }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api.js");
    const { getTmdbTitleMeta } = await import("/src/lib/addon-catalogs.js");
    const { torrentioResourceUrl } = await import("/src/lib/torrentio.js");
    const { playbackIdentity } = await import("/src/lib/playback-progress.js");
    api.getSeasonDetails = async () => {
      throw new Error(
        "Grouped seasons must not use the default season endpoint",
      );
    };
    const details = {
      id: 220542,
      imdbId: "tt26743760",
      mediaType: "tv",
      seasons: [{ seasonNumber: 1, episodeCount: 26 }],
    };
    const meta = await getTmdbTitleMeta(details, 2);
    const other = await getTmdbTitleMeta(meta.tmdbDetails, 1);
    return {
      meta,
      other: other.videos,
      progress: playbackIdentity({ ...meta, ...meta.videos[0] }, 2, 1),
      streamUrl: torrentioResourceUrl(details, 2, meta.videos[0].episode),
    };
  });
  expect(result.meta.tmdbSeasons.map((s) => s.seasonNumber)).toEqual([1, 2]);
  expect(result.meta.selectedSeason).toBe(2);
  expect(result.progress.key).toBe("tmdb:tv:220542:s1:e25");
  expect(result.meta.videos).toMatchObject([
    {
      id: "tt26743760:2:1",
      season: 2,
      episode: 1,
      title: "Premiere",
      sourceVideoId: "tt26743760:1:25",
      sourceSeasonNumber: 1,
      sourceEpisodeNumber: 25,
      releaseDate: "2025-01-10",
    },
    {
      id: "tt26743760:2:2",
      episode: 2,
      title: "Second",
      sourceEpisodeNumber: 26,
    },
  ]);
  expect(result.meta.videos[1].image).toContain("/second.jpg");
  expect(result.other[0].id).toBe("tt26743760:1:1");
  expect(decodeURIComponent(result.streamUrl)).toContain("tt26743760:2:1");
});

test("unavailable episode groups fall back to original seasons", async ({
  page,
}) => {
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.goto("/");
  const meta = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api.js");
    const { getTmdbTitleMeta } = await import("/src/lib/addon-catalogs.js");
    api.getEpisodeGroups = async () => [
      { id: "6782169d78cfcd77ed4e89be", type: 6, group_count: 2 },
    ];
    api.getEpisodeGroup = async () => {
      throw new Error("Unavailable");
    };
    api.getSeasonDetails = async () => ({
      episodes: [{ episodeNumber: 25, title: "Original" }],
    });
    return getTmdbTitleMeta(
      {
        id: 220542,
        imdbId: "tt26743760",
        mediaType: "tv",
        seasons: [{ seasonNumber: 1, episodeCount: 26 }],
      },
      1,
    );
  });
  expect(meta.tmdbSeasons).toEqual([{ seasonNumber: 1, episodeCount: 26 }]);
  expect(meta.videos[0].sourceVideoId).toBe("tt26743760:1:25");
});

test("automatic season discovery works for other titles and rejects unsafe orders", async ({
  page,
}) => {
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { api, config } = await import("/src/lib/api.js");
    const { getTmdbTitleMeta } = await import("/src/lib/addon-catalogs.js");
    const details = {
      id: 9001,
      imdbId: "tt9001000",
      mediaType: "tv",
      seasons: [{ seasonNumber: 1, episodeCount: 4 }],
    };
    const episodes = [1, 2, 3, 4].map((n) => ({
      episodeNumber: n,
      sourceSeasonNumber: 1,
      sourceEpisodeNumber: n,
      title: `Episode ${n}`,
    }));
    const valid = [
      { seasonNumber: 1, episodes: episodes.slice(0, 2) },
      {
        seasonNumber: 2,
        episodes: episodes
          .slice(2)
          .map((e, i) => ({ ...e, episodeNumber: i + 1 })),
      },
    ];
    let candidate = valid;
    let type = 6;
    let lookups = 0;
    api.getEpisodeGroups = async () => {
      lookups++;
      return [{ id: "111111111111111111111111", type, group_count: 2 }];
    };
    api.getEpisodeGroup = async () => candidate;
    api.getSeasonDetails = async () => ({ episodes });
    const mapped = await getTmdbTitleMeta(details, 2);
    const beforeReload = lookups;
    const reloaded = await getTmdbTitleMeta(mapped.tmdbDetails, 1);
    const reused =
      lookups === beforeReload && reloaded.tmdbSeasons.length === 2;
    const rejected = [];
    for (const invalid of [
      [
        { seasonNumber: 1, episodes: episodes.slice(0, 2) },
        { seasonNumber: 2, episodes: episodes.slice(3) },
      ],
      [
        { seasonNumber: 1, episodes: episodes.slice(0, 2) },
        { seasonNumber: 2, episodes: episodes.slice(1, 3) },
      ],
      [
        { seasonNumber: 1, episodes: episodes.slice(2) },
        { seasonNumber: 2, episodes: episodes.slice(0, 2) },
      ],
    ]) {
      candidate = invalid;
      rejected.push((await getTmdbTitleMeta(details, 1)).tmdbSeasons.length);
    }
    candidate = valid;
    type = 7;
    const cours = await getTmdbTitleMeta(details, 1);
    type = 6;
    config.tmdbAutoEpisodeGroups = false;
    const disabled = await getTmdbTitleMeta(details, 1);
    return {
      mapped: mapped.videos,
      reused,
      rejected,
      cours: cours.tmdbSeasons.length,
      disabled: disabled.tmdbSeasons.length,
    };
  });
  expect(result.mapped[0]).toMatchObject({
    id: "tt9001000:2:1",
    sourceVideoId: "tt9001000:1:3",
  });
  expect(result.reused).toBe(true);
  expect(result.rejected).toEqual([1, 1, 1]);
  expect(result.cours).toBe(1);
  expect(result.disabled).toBe(1);
});
import { mockPlayback } from "./helpers/playback.js";

for (const type of ["movie", "series"]) {
  test(`resolves an IMDb ${type} route without a metadata add-on`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "rainflix:addons:session:v1",
        JSON.stringify([
          {
            id: "catalog",
            enabled: true,
            manifestUrl: "https://catalog.example/manifest.json",
            manifest: {
              id: "catalog",
              name: "Catalog",
              types: ["movie", "series"],
              resources: ["catalog"],
            },
          },
          {
            id: "streams",
            enabled: true,
            manifestUrl: "https://streams.example/manifest.json",
            manifest: {
              id: "streams",
              name: "Streams",
              types: ["movie", "series"],
              idPrefixes: ["tt"],
              resources: ["stream"],
            },
          },
        ]),
      ),
    );
    const lookups = [];
    await page.route("https://api.themoviedb.org/3/find/**", (route) => {
      lookups.push(new URL(route.request().url()));
      return route.fulfill({
        json: {
          movie_results: type === "movie" ? [{ id: 505 }] : [],
          tv_results: type === "series" ? [{ id: 505 }] : [],
        },
      });
    });
    await page.route("https://api.themoviedb.org/3/tv/505?*", (route) =>
      route.fulfill({
        json: {
          id: 505,
          name: "Playback Test",
          external_ids: { imdb_id: "tt9335498" },
          seasons: [
            { season_number: 1, episode_count: 2 },
            { season_number: 2, episode_count: 1 },
          ],
        },
      }),
    );
    await page.route(
      "https://api.themoviedb.org/3/tv/505/season/2?*",
      (route) =>
        route.fulfill({
          json: {
            season_number: 2,
            episodes: [
              { episode_number: 1123, name: "Second season premiere" },
              { episode_number: 1124, name: "Second season follow-up" },
            ],
          },
        }),
    );
    const streams = [];
    await page.route("https://streams.example/**", (route) => {
      streams.push(route.request().url());
      return route.fulfill({ json: { streams: [] } });
    });
    await page.goto(`/#/addon/catalog/title/${type}/tt9335498`);
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: "Playback Test", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Metadata provider", exact: true }),
    ).toHaveCount(0);
    expect(lookups[0].pathname).toBe("/3/find/tt9335498");
    expect(lookups[0].searchParams.get("external_source")).toBe("imdb_id");
    expect(streams).toHaveLength(1);
    if (type === "series")
      await page.getByRole("button", { name: "1. First", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Play with Streams", exact: true }),
    ).toHaveCount(0);
    await expect
      .poll(() => streams[0])
      .toBe(
        `https://streams.example/stream/${type}/tt9335498${type === "series" ? "%3A1%3A1" : ""}.json`,
      );
    if (type === "series") {
      await page.getByRole("button", { name: "Back to episodes" }).click();
      await page
        .getByRole("combobox", { name: "Season", exact: true })
        .selectOption("2");
      await expect(
        page.getByRole("button", {
          name: "1. Second season premiere",
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "1. Second season premiere", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Play with Streams", exact: true }),
      ).toHaveCount(0);
      await expect
        .poll(() => streams.at(-1))
        .toBe("https://streams.example/stream/series/tt9335498%3A2%3A1.json");
      await page.getByRole("button", { name: "Back to episodes" }).click();
      await page
        .getByRole("button", {
          name: "2. Second season follow-up",
          exact: true,
        })
        .click();
      await expect
        .poll(() => streams.at(-1))
        .toBe("https://streams.example/stream/series/tt9335498%3A2%3A2.json");
      for (const link of [
        "/#/addon/catalog/title/series/tt9335498?video=tt9335498%3A2%3A1124",
        "/#/title/tv/505?season=2&episode=1124",
      ]) {
        await page.goto(link);
        if (link.includes("/addon/")) {
          await expect(
            page.getByText("S2 E2: Second season follow-up", { exact: true }),
          ).toBeVisible();
          await page.getByRole("button", { name: "Back to episodes" }).click();
        }
        await expect(
          page.getByRole("button", {
            name: "2. Second season follow-up",
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect
          .poll(() => streams.at(-1))
          .toBe("https://streams.example/stream/series/tt9335498%3A2%3A2.json");
      }
    }
    await page.reload();
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Playback Test", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });
}

test("TMDb absolute episodes become season-local stream IDs without changing specials", async ({
  page,
}) => {
  await page.route("**/", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { api } = await import("/src/lib/api.js");
    const { getTmdbTitleMeta } = await import("/src/lib/addon-catalogs.js");
    const { addonVideoIdentity } = await import("/src/lib/addons.js");
    const { torrentioResourceUrl } = await import("/src/lib/torrentio.js");
    const { playbackIdentity } = await import("/src/lib/playback-progress.js");
    api.getSeasonDetails = async () => ({
      episodes: [
        { episodeNumber: 1124, title: "Next", image: "next.jpg" },
        { episodeNumber: 1123, title: "Premiere", image: "first.jpg" },
        { episodeNumber: 1126, title: "After gap", image: "later.jpg" },
      ],
    });
    const details = {
      id: 505,
      imdbId: "tt0505000",
      mediaType: "tv",
      seasons: [{ seasonNumber: 0 }, { seasonNumber: 23 }],
    };
    const meta = await getTmdbTitleMeta(details, 23);
    const special = await getTmdbTitleMeta(details, 0);
    return {
      videos: meta.videos,
      special: special.videos.map((video) => video.episode),
      addon: addonVideoIdentity(
        { ...meta, addonVideoId: meta.videos[0].id },
        23,
        1,
      ),
      torrentio: torrentioResourceUrl(details, 23, meta.videos[0].episode),
      progress: playbackIdentity(
        { ...meta, sourceEpisodeNumber: meta.videos[0].sourceEpisodeNumber },
        23,
        1,
      ),
    };
  });
  expect(result.videos).toMatchObject([
    {
      id: "tt0505000:23:1",
      episode: 1,
      sourceEpisodeNumber: 1123,
      title: "Premiere",
      image: "first.jpg",
    },
    {
      id: "tt0505000:23:2",
      episode: 2,
      sourceEpisodeNumber: 1124,
      title: "Next",
      image: "next.jpg",
    },
    {
      id: "tt0505000:23:4",
      episode: 4,
      sourceEpisodeNumber: 1126,
      title: "After gap",
    },
  ]);
  expect(result.special).toEqual([1123, 1124, 1126]);
  expect(result.addon.id).toBe("tt0505000:23:1");
  expect(result.torrentio).toContain("/stream/series/tt0505000%3A23%3A1.json");
  expect(result.progress.key).toBe("tmdb:tv:505:s23:e1123");
});
