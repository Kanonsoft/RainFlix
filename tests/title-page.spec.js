import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  selectPlayer,
  selectStream,
  history,
} from "./helpers/playback.js";

test.beforeEach(mockPlayback);

async function titleArtwork(page) {
  await page.route("https://api.themoviedb.org/3/movie/505?*", (route) =>
    route.fulfill({
      json: {
        id: 505,
        external_ids: { imdb_id: "tt0505000" },
        title: "Playback Test",
        overview: "A deterministic playback test.",
        poster_path: "/poster.jpg",
        backdrop_path: "/backdrop.jpg",
        images: { logos: [{ file_path: "/test-logo.png", iso_639_1: "en" }] },
        videos: {
          results: [
            {
              key: "trailer_fixture",
              site: "YouTube",
              type: "Trailer",
              official: true,
            },
          ],
        },
      },
    }),
  );
  await page.route("https://image.tmdb.org/**/test-logo.png", (route) =>
    route.fulfill({
      path: "assets/rainflix-wordmark.png",
      contentType: "image/png",
    }),
  );
}

test("title artwork falls back to text and trailers open without a player header", async ({
  page,
  baseURL,
}) => {
  await titleArtwork(page);
  let trailers = 0;
  let releaseLookup;
  const lookup = new Promise((resolve) => {
    releaseLookup = resolve;
  });
  await page.route("https://yastream.tamthai.de/**", async (route) => {
    await lookup;
    await route.fulfill({
      json: {
        streams: [
          {
            name: "Late source",
            url: `${baseURL}/__media__/player-sample.mp4`,
          },
        ],
      },
    });
  });
  await page.route("https://www.youtube-nocookie.com/**", (route) => {
    trailers++;
    return route.fulfill({
      contentType: "text/html",
      body: "<html><body>Trailer fixture</body></html>",
    });
  });
  await openPlayer(page);
  const heading = page.getByRole("heading", {
    name: "Playback Test",
    level: 1,
  });
  await expect(heading.getByRole("img")).toBeVisible();
  expect(
    await heading.getByRole("img").evaluate((image) => image.naturalWidth),
  ).toBeGreaterThan(0);
  await expect(page.locator("#titleTrailer")).toHaveCount(0);
  expect(trailers).toBe(0);
  await selectPlayer(page, "yastream");
  await expect(page.getByText("Finding streams")).toBeVisible();
  await page
    .getByRole("group", { name: "Title actions" })
    .getByRole("button", { name: "Play trailer" })
    .click();
  releaseLookup();
  const frame = page.locator("#playerShell iframe");
  await expect(frame).toHaveAttribute("src", /trailer_fixture\?autoplay=1/);
  const size = await frame.boundingBox();
  expect(size.y).toBe(0);
  expect(size.height).toBe(await page.evaluate(() => innerHeight));
  await expect(
    page.locator("#fullscreenPlayback").getByRole("heading"),
  ).toHaveCount(0);
  await expect(page.locator("#app-shell")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect(await history(page)).toHaveLength(0);
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  await page.goBack();
  await expect(frame).toHaveCount(0);
  await heading
    .getByRole("img")
    .evaluate((image) => image.dispatchEvent(new Event("error")));
  await expect(heading.getByRole("img")).toHaveCount(0);
  await expect(heading).toHaveText("Playback Test");
});

for (const width of [390, 1440]) {
  test(`similar titles scroll as a carousel at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 950 });
    await titleArtwork(page);
    await page.route(
      /api\.themoviedb\.org\/3\/movie\/505\/(similar|recommendations)/,
      (route) =>
        route.fulfill({
          json: {
            results: Array.from({ length: 12 }, (_, index) => ({
              id: index + 600,
              title: `Related title ${index + 1}`,
              poster_path: "/poster.jpg",
              vote_average: 8,
              release_date: "2025-01-01",
              overview: "Related movie.",
            })),
          },
        }),
    );
    await openPlayer(page);
    const carousel = page.locator("#similarCarousel");
    await expect(carousel.getByRole("link")).toHaveCount(12);
    expect(
      await carousel.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    await expect(
      page.getByRole("button", { name: /similar titles/ }),
    ).toHaveCount(0);
    await carousel.getByRole("link").last().focus();
    await expect
      .poll(() => carousel.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await carousel.getByRole("link").first().focus();
    await expect
      .poll(() => carousel.evaluate((node) => node.scrollLeft))
      .toBe(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`title-carousel-${width}.png`),
      fullPage: true,
    });
  });
}

test("a sole stream skips source navigation and returns to Players after closing", async ({
  page,
  baseURL,
}) => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("https://yastream.tamthai.de/**", async (route) => {
    if (!route.request().url().includes("/stream/"))
      return route.fulfill({ json: { subtitles: [] } });
    await ready;
    return route.fulfill({
      json: {
        streams: [
          {
            name: "Only stream",
            url: `${baseURL}/__media__/player-sample.mp4`,
          },
        ],
      },
    });
  });
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Finding streams").filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to players", includeHidden: true }),
  ).toHaveCount(0);
  await expect(page.locator("[data-stream-id]")).toHaveCount(0);
  await page.evaluate(() => {
    window.__sourceListSeen = false;
    new MutationObserver(() => {
      if (
        document.querySelector(
          "[data-stream-id], button[aria-label='Back to players']",
        )
      )
        window.__sourceListSeen = true;
    }).observe(document.getElementById("app-shell"), {
      childList: true,
      subtree: true,
    });
  });
  release();
  await expect(page.locator("#playerShell video")).toBeVisible();
  await page.getByRole("button", { name: "Close player" }).click();
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__sourceListSeen)).toBe(false);
  await expect(
    page.getByRole("button", { name: "Play with Yastream" }),
  ).toBeVisible();
});

test("sources replace players, scroll independently, and Back cancels pending lookup", async ({
  page,
  baseURL,
}, testInfo) => {
  let releaseLookup;
  const pending = new Promise((resolve) => {
    releaseLookup = resolve;
  });
  let lookups = 0;
  const media = [];
  page.on("request", (request) => {
    if (request.url().includes("/__media__/")) media.push(request.url());
  });
  await page.route("https://yastream.tamthai.de/**", async (route) => {
    lookups++;
    if (lookups === 2) {
      await pending;
      return route.fulfill({
        json: {
          streams: [
            {
              name: "Late stream",
              url: `${baseURL}/__media__/player-sample.mp4`,
            },
          ],
        },
      });
    }
    return route.fulfill({
      json: {
        streams: Array.from({ length: 30 }, (_, index) => ({
          name: `Source ${index + 1}`,
          url: `${baseURL}/__media__/player-sample.mp4?source=${index}`,
        })),
      },
    });
  });
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  await expect.poll(() => lookups).toBe(1);
  const panel = page.getByRole("complementary", { name: "Playback options" });
  await expect(panel.getByRole("button", { name: /^Play with/ })).toHaveCount(
    0,
  );
  await expect(
    panel.getByRole("heading", { name: "Yastream", exact: true }),
  ).toBeVisible();
  const back = panel.getByRole("button", { name: "Back to players" });
  await expect(back).toBeFocused();
  await page.getByRole("button", { name: "Refresh streams" }).click();
  await expect.poll(() => lookups).toBe(2);
  await expect(
    page.getByText("Finding streams").filter({ visible: true }),
  ).toBeVisible();
  await back.click();
  await expect(
    panel.getByRole("button", { name: "Play with Yastream" }),
  ).toBeFocused();
  releaseLookup();
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await selectPlayer(page, "yastream");
  await expect(page.locator("button[data-stream-id]")).toHaveCount(30);
  const scrollArea = panel.locator("[data-source-list]");
  expect(
    await scrollArea.evaluate((node) => node.scrollHeight > node.clientHeight),
  ).toBe(true);
  await page.locator("button[data-stream-id]").last().focus();
  expect(await scrollArea.evaluate((node) => node.scrollTop)).toBeGreaterThan(
    0,
  );
  await expect(back).toBeInViewport();
  expect(media).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("source-panel.png"),
    fullPage: true,
  });
  await back.click();
  await expect(
    panel.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  await expect(panel.locator("button[data-stream-id]")).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`episode list stays bounded, searchable, and navigable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("https://api.themoviedb.org/3/tv/505?*", (route) =>
      route.fulfill({
        json: {
          id: 505,
          name: "Playback Test",
          overview: "A series with many episodes.",
          poster_path: "/poster.jpg",
          external_ids: { imdb_id: "tt0505000" },
          seasons: [1, 2].map((season) => ({
            season_number: season,
            episode_count: 40,
          })),
        },
      }),
    );
    await page.route(
      "https://api.themoviedb.org/3/tv/505/season/*?*",
      (route) => {
        const season = Number(
          new URL(route.request().url()).pathname.split("/").at(-1),
        );
        return route.fulfill({
          json: {
            season_number: season,
            episodes: Array.from({ length: 40 }, (_, index) => ({
              episode_number: index + 1,
              name:
                index === 39
                  ? "Finale"
                  : `Season ${season} adventure ${index + 1}: A very long title that wraps across multiple lines`,
              still_path: "/episode.jpg",
              air_date: "2024-01-05",
              overview: "Episode descriptions must stay hidden.",
            })),
          },
        });
      },
    );
    await openPlayer(page, "tv");
    const episodes = page.getByRole("region", {
      name: "Episodes",
      exact: true,
    });
    const viewport = episodes.locator("[data-episode-list]");
    const search = episodes.getByRole("searchbox", { name: "Search episodes" });
    await expect(episodes.locator("[data-video-id]")).toHaveCount(40);
    await expect(page.getByRole("button", { name: /^Play with/ })).toHaveCount(
      0,
    );
    const panel = page.getByRole("complementary", { name: "Playback options" });
    await expect(panel.getByRole("combobox", { name: "Season" })).toBeVisible();
    await expect(
      episodes.getByRole("button", { name: "Previous season" }),
    ).toBeDisabled();
    await expect(
      episodes.getByRole("combobox", { name: "Season" }),
    ).toHaveValue("1");
    await expect(episodes.locator("time").first()).toHaveText("Jan 5, 2024");
    await expect(episodes.locator("img").first()).toHaveAttribute(
      "src",
      /episode\.jpg$/,
    );
    await expect(
      page.getByText("Episode descriptions must stay hidden."),
    ).toHaveCount(0);
    expect(
      await viewport.evaluate((node) => node.scrollHeight > node.clientHeight),
    ).toBe(true);
    expect((await viewport.boundingBox()).height).toBeLessThan(550);
    await episodes
      .getByRole("button", { name: "40. Finale", exact: true })
      .focus();
    expect(await viewport.evaluate((node) => node.scrollTop)).toBeGreaterThan(
      0,
    );
    await expect(search).toBeInViewport();
    await search.fill("not found");
    await expect(episodes.getByRole("status")).toHaveText(
      "No matching episodes.",
    );
    await search.fill("finale");
    await expect(episodes.locator("[data-video-id]")).toHaveCount(1);
    await episodes
      .getByRole("button", { name: "40. Finale", exact: true })
      .click();
    await expect(page).toHaveURL(/season=1&episode=40/);
    await expect(
      page.getByRole("heading", { name: "Players", exact: true }),
    ).toBeVisible();
    await expect(page.locator("[data-episode-list]")).toHaveCount(0);
    await page.getByRole("button", { name: "Back to episodes" }).click();
    await expect(
      episodes.getByRole("button", { name: "40. Finale", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#playerShell")).toHaveCount(0);
    expect(await history(page)).toEqual([]);
    await episodes.getByRole("button", { name: "Next season" }).click();
    await expect(
      episodes.getByRole("combobox", { name: "Season" }),
    ).toHaveValue("2");
    await expect(search).toHaveValue("");
    await expect(
      episodes.getByRole("button", { name: "Next season" }),
    ).toBeDisabled();
    await expect(episodes.locator("[data-video-id]")).toHaveCount(40);
    await episodes.getByRole("button", { name: "Previous season" }).click();
    await expect(
      episodes.getByRole("combobox", { name: "Season" }),
    ).toHaveValue("1");
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await page.evaluate(() => {
      document.activeElement?.blur();
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: testInfo.outputPath(`episodes-${width}.png`),
      fullPage: true,
    });
  });
}

test("legacy watch routes open details, with fullscreen and Back returning to them", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openPlayer(page);
  await expect(page).toHaveURL(/#\/title\/movie\/505$/);
  await expect(
    page.getByRole("heading", { name: "Playback Test", level: 1 }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#playerShell")).toHaveCount(0);
  await expect(page.getByLabel("Metadata provider")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Manage add-ons" })).toHaveCount(
    0,
  );
  const poster = await page.getByAltText("Playback Test poster").boundingBox();
  const players = await page
    .getByRole("complementary", { name: "Playback options" })
    .boundingBox();
  expect(players.x).toBeGreaterThan(poster.x + poster.width);
  await selectPlayer(page, "vidsrc");
  await expect(page).toHaveURL(/play=1/);
  await expect(page.locator("#app-shell")).toHaveAttribute("inert", "");
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe("fullscreenPlayback");
  expect(await history(page)).toHaveLength(0);
  await page.goBack();
  await expect(page).toHaveURL(/#\/title\/movie\/505$/);
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await expect(page.locator("#app-shell")).not.toHaveAttribute("inert");
  await page.goForward();
  await expect(page).toHaveURL(/play=1/);
  await expect(page.locator("#playerShell")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("native fullscreen fallback autoplays, switches sources, and stops on Escape", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen denied"));
  });
  const requests = [];
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              {
                name: "First source",
                url: `${baseURL}/__media__/player-sample.mp4?source=1`,
              },
              {
                name: "Second source",
                url: `${baseURL}/__media__/player-sample.mp4?source=2`,
              },
            ],
          }
        : { subtitles: [] },
    }),
  );
  page.on("request", (request) => {
    if (request.url().includes("/__media__/")) requests.push(request.url());
  });
  await openPlayer(page);
  expect(requests).toHaveLength(0);
  await selectPlayer(page, "yastream");
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await selectStream(page, "0");
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((node) => node.currentTime))
    .toBeGreaterThan(0);
  await expect.poll(() => history(page)).toHaveLength(1);
  await selectStream(page, "1");
  await expect(video).toHaveAttribute("src", /source=2/);
  await expect
    .poll(() => video.evaluate((node) => node.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((node) => {
    window.__oldVideo = node;
  });
  await page.getByRole("button", { name: "Close player" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      paused: window.__oldVideo.paused,
      src: window.__oldVideo.getAttribute("src"),
    })),
  ).toEqual({ paused: true, src: null });
  await expect(page.locator('button[data-stream-id="1"]')).toBeFocused();
});

for (const width of [390, 1440]) {
  test(`title layout is contained at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openPlayer(page, "tv");
    await expect(
      page.getByRole("region", { name: "Episodes", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      )
      .toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`title-${width}.png`),
      fullPage: true,
    });
  });
}
