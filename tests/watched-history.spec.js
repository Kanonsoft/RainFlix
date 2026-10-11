import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  selectPlayer,
  closePlayer,
} from "./helpers/playback.js";

// The full history library is native-only; retain browser video fixtures here.
test.beforeEach(async ({ page }) => {
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isNativeApp=true,isAndroid=false,isDesktop=false,browserTorrentAvailable=true; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.route("**/src/lib/native-torrent.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const withNativeMedia=s=>s,withNativeTorrent=s=>s; export async function prepareNativePlayerLogo(){return null;} export async function startNativeTorrent(){throw Error('Native transport is outside this history fixture');} export async function invokeNativePlayer(){} export async function listenNativePlayer(){return ()=>{};}",
    }),
  );
});

test("manual watched marks remove the whole series and preserve unrelated history", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, true, true);
  await page.addInitScript(() => {
    if (localStorage.getItem("history-fixture")) return;
    localStorage.setItem("history-fixture", "1");
    const movie = {
      id: 505,
      mediaType: "movie",
      title: "Movie history",
      season: 1,
      episode: 1,
    };
    const series = {
      id: 506,
      mediaType: "tv",
      title: "Series history",
      season: 2,
      episode: 3,
      seasonEpisodeCounts: [{ seasonNumber: 2, episodeCount: 4 }],
    };
    localStorage.setItem(
      "rainflix:recently-viewed:v1",
      JSON.stringify([movie, series]),
    );
    localStorage.setItem("rainflix:my-list:v1", JSON.stringify([movie]));
    localStorage.setItem(
      "rainflix:playback-progress:v1",
      JSON.stringify([
        [
          "tmdb:movie:505",
          {
            position: 300,
            duration: 1000,
            completed: false,
            updatedAt: Date.now(),
          },
        ],
        [
          "tmdb:tv:506:s2:e3",
          {
            position: 100,
            duration: 1000,
            completed: false,
            updatedAt: Date.now(),
          },
        ],
      ]),
    );
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/home");
  const series = page.getByRole("link", {
    name: "Continue watching Series history",
  });
  await expect(
    page.getByRole("button", { name: /History options/ }),
  ).toHaveCount(0);
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  const beforeHold = page.url();
  await series.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: 50,
    clientY: 250,
  });
  await expect(
    page.getByRole("menu", { name: "Series history history" }),
  ).toBeVisible();
  await series.dispatchEvent("pointerup", { pointerType: "touch" });
  await series.dispatchEvent("click");
  expect(page.url()).toBe(beforeHold);
  await page.keyboard.press("Escape");
  await series.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Series history history" });
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Open in new tab" }),
  ).toHaveCount(0);
  const rect = await menu.boundingBox();
  expect(rect.x + rect.width).toBeLessThanOrEqual(390);
  await menu
    .getByRole("menuitem", { name: "Mark as watched", exact: true })
    .click();
  await expect(series).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue watching Movie history" }),
  ).toBeVisible();
  await page.goto("/#/library");
  const watched = page
    .getByRole("heading", { name: "Watched", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(
    watched.getByRole("link", {
      name: "More information about Series history",
    }),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    watched.getByRole("link", {
      name: "More information about Series history",
    }),
  ).toHaveCount(1);
  await expect(series).toHaveCount(0);
  await page
    .getByRole("link", { name: "More information about Series history" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from watched" }).click();
  const state = await page.evaluate(() => ({
    recent: JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1")),
    progress: JSON.parse(localStorage.getItem("rainflix:playback-progress:v1")),
    saved: JSON.parse(localStorage.getItem("rainflix:my-list:v1")),
  }));
  expect(state.recent.map((item) => item.id)).toEqual([505]);
  expect(state.progress.map(([key]) => key)).toEqual(["tmdb:movie:505"]);
  expect(state.saved.map((item) => item.id)).toEqual([505]);
});

for (const mediaType of ["movie", "tv"]) {
  test(`manual ${mediaType} marks stay out of Continue Watching without season metadata`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false, true);
    await page.addInitScript((mediaType) => {
      if (localStorage.getItem("manual-watched-fixture")) return;
      localStorage.setItem("manual-watched-fixture", "1");
      localStorage.setItem(
        "rainflix:recently-viewed:v1",
        JSON.stringify([
          { id: 9000, mediaType, title: "Manual title", season: 1, episode: 1 },
        ]),
      );
    }, mediaType);
    await page.goto("/#/home");
    const card = page.getByRole("link", {
      name: "Continue watching Manual title",
    });
    await card.click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Mark as watched", exact: true })
      .click();
    await expect(card).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1"))
              .length,
        ),
      )
      .toBe(0);
    await page.goto("/#/library");
    const watched = page
      .getByRole("heading", { name: "Watched", exact: true })
      .locator("xpath=ancestor::section[1]");
    await expect(
      watched.getByRole("link", {
        name: "More information about Manual title",
      }),
    ).toHaveCount(1);
    await page.reload();
    await expect(card).toHaveCount(0);
    await expect(
      watched.getByRole("link", {
        name: "More information about Manual title",
      }),
    ).toHaveCount(1);
    await watched
      .getByRole("link", { name: "More information about Manual title" })
      .click({ button: "right" });
    await page
      .getByRole("menuitem", { name: "Mark as unwatched", exact: true })
      .click();
    await expect(card).toBeVisible();
    await expect(
      watched.getByRole("link", {
        name: "More information about Manual title",
      }),
    ).toHaveCount(0);
  });
}

test("startup removes stale Continue Watching entries for manually marked titles", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false, true);
  await page.addInitScript(() => {
    const title = {
      id: 9000,
      mediaType: "tv",
      title: "Previously marked",
      season: 1,
      episode: 1,
      markedWatched: true,
      watchedEpisodes: [[1, 1]],
    };
    localStorage.setItem("rainflix:watched:v1", JSON.stringify([title]));
    localStorage.setItem(
      "rainflix:recently-viewed:v1",
      JSON.stringify([
        title,
        { id: 9001, mediaType: "movie", title: "Still watching" },
      ]),
    );
  });
  await page.goto("/#/home");
  await expect(
    page.getByRole("link", { name: "Continue watching Still watching" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue watching Previously marked" }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1")).map(
          (item) => item.id,
        ),
      ),
    )
    .toEqual([9001]);
});

test("series stay in Continue Watching until all episodes finish, then have one Watched card", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, true, true);
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              { name: "1080p", url: `${baseURL}/__media__/player-sample.mp4` },
            ],
          }
        : { subtitles: [] },
    }),
  );
  const finish = async () => {
    const video = page.locator("#playerShell video");
    await expect
      .poll(() => video.evaluate((node) => node.readyState))
      .toBeGreaterThanOrEqual(3);
    await video.evaluate((node) => {
      node.pause();
      Object.defineProperty(node, "duration", {
        configurable: true,
        value: 2700,
      });
      Object.defineProperty(node, "currentTime", {
        configurable: true,
        value: 2430,
      });
      Object.defineProperty(node, "seeking", {
        configurable: true,
        value: false,
      });
      node.dispatchEvent(new Event("playing"));
      node.dispatchEvent(new Event("timeupdate"));
    });
  };
  await openPlayer(page, "tv");
  await selectPlayer(page, "yastream");
  await finish();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1"))[0]
            ?.episode,
      ),
    )
    .toBe(2);
  await closePlayer(page);
  await page.goto("/#/library");
  const watched = page
    .getByRole("heading", { name: "Watched", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(watched.getByText("Playback Test")).toHaveCount(0);
  await page
    .getByRole("link", { name: "Continue watching Playback Test" })
    .click();
  await expect(page).toHaveURL(/episode=2/);
  await finish();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1"))
            .length,
      ),
    )
    .toBe(0);
  await closePlayer(page);
  await page.goto("/#/library");
  await expect(
    watched.getByRole("link", { name: "More information about Playback Test" }),
  ).toHaveCount(1);
  await expect(watched.getByText(/Watched S\d/)).toHaveCount(0);
  await page.reload();
  await expect(
    watched.getByRole("link", { name: "More information about Playback Test" }),
  ).toHaveCount(1);
  const history = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rainflix:watched:v1")),
  );
  expect(history).toHaveLength(1);
  expect(history[0].watchedEpisodes).toEqual([
    [1, 1],
    [1, 2],
  ]);
});

test("legacy episode histories are grouped without mistaking gaps for a completed series", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { groupWatchedHistory, seriesFinished, remainingEpisode } =
      await import("/src/lib/library-history.js");
    const title = {
      id: 505,
      mediaType: "tv",
      seasonEpisodeCounts: [
        { seasonNumber: 1, episodeCount: 3 },
        { seasonNumber: 2, episodeCount: 1 },
      ],
    };
    const history = groupWatchedHistory(
      [1, 3, 3].map((episode, i) => ({
        ...title,
        season: 1,
        episode,
        watchedAt: i + 1,
      })),
    );
    const completed = groupWatchedHistory([
      ...history,
      { ...title, season: 1, episode: 2, watchedAt: 5 },
      { ...title, season: 2, episode: 1, watchedAt: 6 },
    ]);
    return {
      count: history.length,
      pairs: history[0].watchedEpisodes,
      finished: seriesFinished(history[0]),
      remaining: remainingEpisode(history[0]),
      complete: seriesFinished(completed[0]),
      unknown: seriesFinished({ ...completed[0], seasonEpisodeCounts: [] }),
    };
  });
  expect(result.count).toBe(1);
  expect(result.pairs).toEqual([
    [1, 1],
    [1, 3],
  ]);
  expect(result.finished).toBe(false);
  expect(result.remaining).toMatchObject({ season: 2, episode: 1 });
  expect(result.complete).toBe(true);
  expect(result.unknown).toBe(false);
});

test("startup migrates duplicate episodes and respects removing unfinished series", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, true, true);
  await page.addInitScript(() => {
    if (localStorage.getItem("migration-fixture")) return;
    localStorage.setItem("migration-fixture", "1");
    localStorage.setItem(
      "rainflix:watched:v1",
      JSON.stringify(
        [505, 506].flatMap((id) =>
          [1, 2].map((episode) => ({
            id,
            mediaType: "tv",
            title: id === 505 ? "Finished series" : "Unfinished series",
            season: 1,
            episode,
            videoId: `tt050${id}0:1:${episode}`,
            watchedAt: episode,
            seasonEpisodeCounts: [
              { seasonNumber: 1, episodeCount: id === 505 ? 2 : 3 },
            ],
          })),
        ),
      ),
    );
  });
  await page.goto("/#/library");
  const watched = page
    .getByRole("heading", { name: "Watched", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(
    watched.getByRole("link", {
      name: "More information about Finished series",
    }),
  ).toHaveCount(1);
  await expect(watched.getByText("Unfinished series")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue watching Unfinished series" }),
  ).toBeVisible();
  await expect(page.getByText("S1:E3", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("rainflix:watched:v1")).length,
      ),
    )
    .toBe(2);
  await page
    .getByRole("link", { name: "Continue watching Unfinished series" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Remove from history" }).click();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Continue watching Unfinished series" }),
  ).toHaveCount(0);
  await watched
    .getByRole("link", { name: "More information about Finished series" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Mark as unwatched" }).click();
  await expect(watched.getByText("Finished series")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue watching Finished series" }),
  ).toBeVisible();
  await expect(page.getByText("S1:E1", { exact: true })).toBeVisible();
});

test("actual playback near credits moves a title from Continue Watching to Watched", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL });
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              {
                name: "Credits test",
                url: `${baseURL}/__media__/player-sample.mp4`,
              },
            ],
          }
        : { subtitles: [] },
    }),
  );
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((node) => node.readyState))
    .toBeGreaterThanOrEqual(3);
  await video.evaluate((node) => {
    node.pause();
    Object.defineProperty(node, "duration", {
      configurable: true,
      value: 1000,
    });
    Object.defineProperty(node, "currentTime", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(node, "seeking", {
      configurable: true,
      value: false,
    });
    node.dispatchEvent(new Event("playing"));
    node.dispatchEvent(new Event("seeked"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(1);
  await video.evaluate((node) => {
    Object.defineProperty(node, "currentTime", {
      configurable: true,
      value: 900,
    });
    node.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("rainflix:watched:v1") || "[]")
            .length,
      ),
    )
    .toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(0);
  await closePlayer(page);
  await page.goto("/#/library");
  const watched = page
    .getByRole("heading", { name: "Watched", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(
    watched.getByRole("link", { name: "More information about Playback Test" }),
  ).toBeVisible();
});

test("completion thresholds reject early playback and invalid durations", async ({
  page,
}) => {
  await page.route("**/", (route) =>
    route.fulfill({ contentType: "text/html", body: "<html></html>" }),
  );
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { playbackFinished } = await import("/src/lib/playback-progress.js");
    return [
      { position: 600, duration: 1000 },
      { position: 899, duration: 1000 },
      { position: 900, duration: 1000 },
      { position: 9500, duration: 10000 },
      { position: 9400, duration: 10000 },
      { position: 200, duration: Infinity },
      { position: 0, duration: 0 },
      { position: 10, duration: 5 },
      { position: 999, duration: 1000, completed: true },
    ].map(playbackFinished);
  });
  expect(result).toEqual([
    false,
    false,
    true,
    true,
    false,
    false,
    false,
    false,
    true,
  ]);
  const seriesResult = await page.evaluate(async () => {
    const { playbackFinished } = await import("/src/lib/playback-progress.js");
    return [
      playbackFinished({ position: 2430, duration: 2700 }, "tv"),
      playbackFinished({ position: 2429, duration: 2700 }, "tv"),
      playbackFinished({ position: 2430, duration: 2700 }, "movie"),
      playbackFinished({ position: 2430, duration: 2700 }, "series"),
      playbackFinished({ position: 300, duration: Infinity }, "tv"),
    ];
  });
  expect(seriesResult).toEqual([true, false, false, true, false]);
});

test("startup advances a near-finished episode across seasons without starting playback", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false, true);
  await page.addInitScript(() => {
    localStorage.setItem(
      "rainflix:recently-viewed:v1",
      JSON.stringify([
        {
          id: 505,
          title: "Playback Test",
          mediaType: "tv",
          season: 1,
          episode: 1,
          videoId: "tt0505000:1:1",
          seasonEpisodeCounts: [
            { seasonNumber: 1, episodeCount: 1 },
            { seasonNumber: 2, episodeCount: 2 },
          ],
        },
      ]),
    );
    localStorage.setItem(
      "rainflix:playback-progress:v1",
      JSON.stringify([
        [
          "tmdb:tv:505:s1:e1",
          { position: 2430, duration: 2700, updatedAt: Date.now() },
        ],
      ]),
    );
  });
  await page.goto("/#/library");
  const resume = page.getByRole("link", {
    name: "Continue watching Playback Test",
  });
  await expect(resume).toHaveAttribute("href", /season=2&episode=1/);
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  const next = await page.evaluate(
    () => JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1"))[0],
  );
  expect([next.season, next.episode, next.videoId]).toEqual([
    2,
    1,
    "tt0505000:2:1",
  ]);
});

test("previously completed playback moves into Watched on startup", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL });
  await page.addInitScript(() => {
    localStorage.setItem(
      "rainflix:recently-viewed:v1",
      JSON.stringify([
        {
          id: 505,
          mediaType: "movie",
          title: "Already finished",
          season: 1,
          episode: 1,
        },
      ]),
    );
    localStorage.setItem(
      "rainflix:playback-progress:v1",
      JSON.stringify([
        [
          "tmdb:movie:505",
          {
            position: 0,
            duration: 1000,
            completed: true,
            updatedAt: Date.now(),
          },
        ],
      ]),
    );
  });
  await page.goto("/#/library");
  const watched = page
    .getByRole("heading", { name: "Watched", exact: true })
    .locator("xpath=ancestor::section[1]");
  await expect(
    watched.getByRole("link", {
      name: "More information about Already finished",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue watching Already finished" }),
  ).toHaveCount(0);
});
