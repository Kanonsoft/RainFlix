import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  history,
  selectPlayer,
  selectStream,
  closePlayer,
  selectCaptions,
  selectEpisode,
} from "./helpers/playback.js";

test.beforeEach(mockPlayback);

test("loads Yastream on selection, plays MP4, and displays SRT captions", async ({
  page,
  baseURL,
}) => {
  const requests = [];
  await page.route("https://yastream.tamthai.de/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const streams = [
      {
        name: "Test source",
        url: `${baseURL}/__media__/player-sample.mp4`,
        behaviorHints: { notWebReady: true },
      },
      { name: "Duplicate", url: `${baseURL}/__media__/player-sample.mp4` },
      { name: "External page", externalUrl: "https://example.com" },
    ];
    return route.fulfill({
      json: url.pathname.includes("/stream/")
        ? { streams }
        : {
            subtitles: [
              { url: `${baseURL}/__media__/captions.srt`, lang: "eng" },
            ],
          },
    });
  });
  await openPlayer(page);
  expect(requests).toHaveLength(0);
  expect(await history(page)).toHaveLength(0);
  await selectPlayer(page, "yastream");
  const video = page.getByLabel("Playback Test Yastream player", {
    exact: true,
  });
  await expect(video).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  const streamUrl = requests.find((url) => url.pathname.includes("/stream/"));
  expect(decodeURIComponent(streamUrl.pathname)).toContain(
    "/stream/movie/tmdb:505.json",
  );
  const options = JSON.parse(
    Buffer.from(
      decodeURIComponent(streamUrl.pathname.split("/")[1]),
      "base64",
    ).toString("utf8"),
  );
  expect(options.stream).toEqual(["kisskh", "onetouchtv"]);
  await expect(page.locator("button[data-stream-id]")).toHaveCount(1);
  await selectCaptions(page, "English");
  await expect
    .poll(() =>
      video.evaluate((element) => element.textTracks[0]?.cues?.length),
    )
    .toBe(1);
  await video.evaluate((element) => element.play());
  await expect.poll(() => history(page)).toHaveLength(1);
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await selectCaptions(page, "Off");
  expect(await video.evaluate((element) => element.textTracks[0].mode)).toBe(
    "disabled",
  );
  await selectPlayer(page, "vidsrc");
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  await expect(page.locator("#playerShell iframe")).toBeVisible();
});

test("plays HLS and reloads the correct episode with mobile controls contained", async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen unavailable"));
  });
  const requests = [];
  await page.route("https://yastream.tamthai.de/**", (route) => {
    const url = new URL(route.request().url());
    requests.push(decodeURIComponent(url.pathname));
    return route.fulfill({
      json: url.pathname.includes("/stream/")
        ? {
            streams: [
              {
                name: "A very long stream provider and resolution label that must stay inside the mobile controls",
                url: `${baseURL}/__media__/player-sample.m3u8`,
              },
            ],
          }
        : { subtitles: [] },
    });
  });
  await openPlayer(page, "tv");
  await selectPlayer(page, "yastream");
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((element) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((element) => element.currentSrc)).toMatch(
    /^blob:/,
  );
  await video.evaluate((element) => element.play());
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((element) => element.pause());
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: testInfo.outputPath("yastream-mobile.png"),
    fullPage: true,
  });
  await selectEpisode(page, 2, "yastream");
  await expect
    .poll(() =>
      requests.some((url) => url.endsWith("/stream/series/tmdb:505:1:2.json")),
    )
    .toBe(true);
  await expect
    .poll(() => video.evaluate((element) => element.readyState))
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => video.evaluate((element) => element.paused))
    .toBe(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#playerShell").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("yastream-desktop.png") });
});

test("handles empty, rate-limited, timed-out and malformed responses with retry", async ({
  page,
}) => {
  let response = { streams: [] };
  let delay = false;
  await page.route("https://yastream.tamthai.de/**", async (route) => {
    if (route.request().url().includes("/subtitles/")) {
      await route.fulfill({ json: { subtitles: [] } });
      return;
    }
    if (delay) await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: response });
  });
  await openPlayer(page);
  await page.evaluate(() => {
    window.RAINFLIX_CONFIG.yastream.requestTimeoutMs = 100;
  });
  await selectPlayer(page, "yastream");
  await expect(
    page.getByText("No streams found for this title on Yastream."),
  ).toBeVisible();
  response = { retryAfter: "60", streams: [] };
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Yastream is busy. Please try again shortly."),
  ).toBeVisible();
  response = {};
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Yastream returned an invalid stream list."),
  ).toBeVisible();
  delay = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Yastream took too long to respond. Try again."),
  ).toBeVisible();
  expect(await history(page)).toHaveLength(0);
});

test("reports playback and header requirements, and cancels stale episode lookups", async ({
  page,
  baseURL,
}) => {
  let releaseFirst;
  const firstResponse = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  await page.route("https://yastream.tamthai.de/**", async (route) => {
    const url = decodeURIComponent(route.request().url());
    if (url.includes("/subtitles/"))
      return route.fulfill({ json: { subtitles: [] } });
    if (url.endsWith("tmdb:505:1:1.json")) {
      await firstResponse;
      return route.fulfill({
        json: {
          streams: [
            {
              name: "Old episode",
              url: `${baseURL}/__media__/player-sample.mp4`,
            },
          ],
        },
      });
    }
    return route.fulfill({
      json: {
        streams: [
          {
            name: "Requires proxy",
            url: `${baseURL}/__media__/headers.mp4`,
            behaviorHints: {
              proxyHeaders: { request: { Referer: "https://example.com" } },
            },
          },
          { name: "Failed source", url: `${baseURL}/__media__/missing.mp4` },
        ],
      },
    });
  });
  await openPlayer(page, "tv");
  await selectPlayer(page, "yastream");
  await expect(page.getByText("Finding streams")).toBeVisible();
  await selectEpisode(page, 2, "yastream");
  await selectStream(page, "1");
  await expect(
    page.getByText(
      "This stream could not play. Retry or choose another stream.",
    ),
  ).toBeVisible();
  releaseFirst();
  await closePlayer(page);
  await expect(
    page.getByText(/This stream requires a media proxy/),
  ).toBeVisible();
  await expect(page.locator("button[data-stream-id]")).toHaveCount(1);
  await expect(page.getByText("Requires proxy")).toBeVisible();
  expect(await history(page)).toHaveLength(0);
});
