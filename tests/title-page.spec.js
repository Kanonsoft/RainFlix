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
  await page.getByRole("button", { name: "Play trailer" }).click();
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
    await page.getByRole("button", { name: "Next similar titles" }).click();
    await expect
      .poll(() => carousel.evaluate((node) => node.scrollLeft))
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Previous similar titles" }).click();
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
      page.getByRole("combobox", { name: "Episode", exact: true }),
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
