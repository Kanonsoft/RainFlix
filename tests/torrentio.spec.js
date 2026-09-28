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

const hash = "0123456789abcdef0123456789abcdef01234567";
const streams = (page) => page.locator("[data-stream-id]");
const torrentPlayback = (page) =>
  page.getByRole("combobox", { name: "Torrent playback", exact: true });

test("lists torrent-only sources with file-aware magnet links and no playback", async ({
  page,
}, testInfo) => {
  const requests = [];
  const source = {
    name: "Torrentio 1080p",
    title:
      "A very long release name and description that must stay within mobile controls",
    infoHash: hash,
    fileIdx: 0,
    sources: [
      "tracker:udp://tracker.example:80/announce",
      "tracker:udp://tracker.example:80/announce",
      "tracker:javascript:alert(1)",
      "dht:ignored",
    ],
    behaviorHints: { filename: "Test File.mp4" },
  };
  await page.route("https://torrentio.strem.fun/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        streams: [
          source,
          source,
          { ...source, fileIdx: 1 },
          { ...source, fileIdx: null },
          { infoHash: "invalid" },
          { infoHash: [hash] },
          { externalUrl: "javascript:alert(1)" },
        ],
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen unavailable"));
  });
  await openPlayer(page);
  expect(requests).toHaveLength(0);
  await selectPlayer(page, "torrentio");
  await torrentPlayback(page).selectOption("external");
  const openTorrent = page.locator('a[data-stream-id="0"]');
  await expect(openTorrent).toBeVisible();
  expect(requests).toEqual([
    "https://torrentio.strem.fun/sizefilter=10GB/stream/movie/tt0505000.json",
  ]);
  await expect(streams(page)).toHaveCount(3);
  const magnet = new URL(await openTorrent.getAttribute("href"));
  expect(magnet.protocol).toBe("magnet:");
  expect(magnet.searchParams.get("xt")).toBe(`urn:btih:${hash}`);
  expect(magnet.searchParams.get("dn")).toBe("Test File.mp4");
  expect(magnet.searchParams.get("so")).toBe("0");
  expect(magnet.searchParams.getAll("tr")).toEqual([
    "udp://tracker.example:80/announce",
  ]);
  expect(
    new URL(
      await page.locator('a[data-stream-id="2"]').getAttribute("href"),
    ).searchParams.get("so"),
  ).toBe("1");
  expect(
    new URL(
      await page.locator('a[data-stream-id="3"]').getAttribute("href"),
    ).searchParams.has("so"),
  ).toBe(false);
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  expect(await history(page)).toHaveLength(0);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await page
    .getByRole("region", { name: "Torrentio streams", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("torrentio-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("region", { name: "Torrentio streams", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("torrentio-desktop.png") });
});

test("plays a WebRTC-compatible torrent in the browser after explicit action", async ({
  page,
  baseURL,
}) => {
  await page.route(`${baseURL}/webtorrent.min.js`, (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        export default class WebTorrent {
          static WEBRTC_SUPPORT = true;
          constructor() { this.destroyed = false; }
          createServer() {}
          once() { return this; }
          add(magnet, options, ready) {
            window.__browserTorrent = { magnet, options, destroyed: false };
            const torrent = {
              downloadSpeed: 1024 * 1024,
              files: [{
                name: "player-sample.mp4",
                length: 1024,
                progress: 1,
                deselect() {},
                streamTo(video) { video.src = "${baseURL}/__media__/player-sample.mp4"; },
              }],
              numPeers: 1,
              progress: 1,
              on() { return this; },
              once() { return this; },
            };
            queueMicrotask(() => ready(torrent));
            return torrent;
          }
          destroy(callback) {
            this.destroyed = true;
            window.__browserTorrent.destroyed = true;
            callback?.();
          }
        }
      `,
    }),
  );
  await page.route("https://torrentio.strem.fun/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "WebTorrent sample",
            infoHash: hash,
            fileIdx: 0,
            behaviorHints: { filename: "player-sample.mp4" },
          },
        ],
      },
    }),
  );

  await openPlayer(page);
  expect(await history(page)).toHaveLength(0);
  await selectPlayer(page, "torrentio");
  await expect(page.locator("[data-stream-id]")).toHaveCount(0);
  const browserVideo = page.getByLabel("Playback Test Torrentio player", {
    exact: true,
  });
  await expect
    .poll(() => browserVideo.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await expect.poll(() => history(page)).toHaveLength(1);

  const browserTorrent = await page.evaluate(() => window.__browserTorrent);
  expect(browserTorrent.magnet).toContain(`xt=urn:btih:${hash}`);
  expect(browserTorrent.magnet).not.toContain("urn%3Abtih%3A");
  const magnet = new URL(browserTorrent.magnet);
  expect(magnet.searchParams.get("xt")).toBe(`urn:btih:${hash}`);
  expect(
    magnet.searchParams.getAll("tr").map((address) => new URL(address).href),
  ).toContain("wss://tracker.openwebtorrent.com/");
  expect(browserTorrent.options).toMatchObject({
    deselect: true,
    destroyStoreOnDestroy: true,
    strategy: "sequential",
  });

  await closePlayer(page);
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__browserTorrent.destroyed))
    .toBe(true);
  await page.evaluate(async () =>
    (await import("/src/lib/browser-torrent.js")).saveTorrentPlaybackMode(
      "external",
    ),
  );
  await selectPlayer(page, "torrentio");
  await expect(page.getByRole("link", { name: "Open torrent" })).toBeVisible();
});

test("accepts a configured manifest and plays direct media only after explicit action", async ({
  page,
  baseURL,
}) => {
  const requests = [];
  const mediaRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/__media__/"))
      mediaRequests.push(request.url());
  });
  await page.route("https://addon.example/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        streams: [
          { name: "Torrent", infoHash: hash, fileIdx: 0 },
          {
            name: "Direct source",
            url: `${baseURL}/__media__/player-sample.mp4`,
            subtitles: [
              { lang: "en", url: `${baseURL}/__media__/captions.srt` },
            ],
          },
        ],
      },
    });
  });
  await openPlayer(page);
  await page.evaluate(() => {
    window.RAINFLIX_CONFIG.torrentio.manifestUrl =
      "stremio://addon.example/private-test/manifest.json";
  });
  expect(mediaRequests).toHaveLength(0);
  expect(await history(page)).toHaveLength(0);
  await selectPlayer(page, "torrentio");
  await expect
    .poll(() => requests)
    .toEqual([
      "https://addon.example/private-test/stream/movie/tt0505000.json",
    ]);
  expect(mediaRequests).toHaveLength(0);
  await selectStream(page, "1");
  const video = page.getByLabel("Playback Test Torrentio player", {
    exact: true,
  });
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await expect.poll(() => history(page)).toHaveLength(1);
  await selectCaptions(page, "English");
  await expect
    .poll(() =>
      video.evaluate((element) => element.textTracks[0]?.cues?.length),
    )
    .toBe(1);
  await video.evaluate((element) => element.pause());
  await closePlayer(page);
  await page.getByRole("button", { name: "Refresh streams" }).click();
  await expect.poll(() => requests).toHaveLength(2);
  await selectStream(page, "1");
  await expect
    .poll(() => video.evaluate((element) => element.paused))
    .toBe(false);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("private-test");
  expect(stored).not.toContain("player-sample.mp4");
});

test("uses IMDb episode IDs and ignores old responses after navigation or provider changes", async ({
  page,
  baseURL,
}) => {
  let releaseFirst;
  const firstResponse = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  const requests = [];
  await page.route("https://torrentio.strem.fun/**", async (route) => {
    const url = decodeURIComponent(route.request().url());
    requests.push(url);
    if (url.endsWith("tt0505000:1:1.json")) await firstResponse;
    await route.fulfill({
      json: {
        streams: [
          {
            name: url.endsWith(":1:1.json") ? "Old episode" : "Current episode",
            infoHash: hash,
            fileIdx: 1,
          },
        ],
      },
    });
  });
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              {
                name: "Yastream source",
                url: `${baseURL}/__media__/player-sample.mp4`,
              },
            ],
          }
        : { subtitles: [] },
    }),
  );
  await openPlayer(page, "tv");
  await page.evaluate(async () =>
    (await import("/src/lib/browser-torrent.js")).saveTorrentPlaybackMode(
      "external",
    ),
  );
  await selectPlayer(page, "torrentio");
  await expect(page.getByText("Finding streams")).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await selectEpisode(page, 2, "torrentio");
  await expect(page.getByRole("link", { name: "Open torrent" })).toBeVisible();
  expect(requests[1]).toBe(
    "https://torrentio.strem.fun/sizefilter=10GB/stream/series/tt0505000:1:2.json",
  );
  await expect(
    page.getByText("Current episode [Torrent]", { exact: true }),
  ).toBeVisible();
  await selectPlayer(page, "yastream");
  releaseFirst();
  await expect(
    page.getByLabel("Playback Test Yastream player", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("button[data-stream-id]")).toHaveCount(0);
  await expect.poll(() => history(page)).toHaveLength(1);
});

test("reports titles without an IMDb match without calling Torrentio", async ({
  page,
}) => {
  await page.route("https://api.themoviedb.org/3/movie/505?**", (route) =>
    route.fulfill({ json: { id: 505, title: "Unmatched", genres: [] } }),
  );
  const requests = [];
  await page.route("https://torrentio.strem.fun/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: { streams: [] } });
  });
  await openPlayer(page);
  await expect(
    page.getByRole("button", { name: "Play with Torrentio" }),
  ).toHaveCount(0);
  expect(requests).toHaveLength(0);
  expect(await history(page)).toHaveLength(0);
});

test("handles empty, unavailable, malformed, rate-limited and timed-out responses", async ({
  page,
}) => {
  let response = { json: { streams: [] } };
  let delay = false;
  await page.route("https://torrentio.strem.fun/**", async (route) => {
    if (delay) await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill(response);
  });
  await openPlayer(page);
  await page.evaluate(() => {
    window.RAINFLIX_CONFIG.torrentio.requestTimeoutMs = 100;
  });
  await selectPlayer(page, "torrentio");
  await expect(
    page.getByText("No streams found for this title on Torrentio."),
  ).toBeVisible();
  for (const [next, message] of [
    [{ status: 429 }, "Torrentio is busy. Please try again shortly."],
    [{ status: 503 }, "Torrentio request failed (503). Try again."],
    [
      { body: "not json" },
      "Torrentio returned an unreadable response. Try again later.",
    ],
    [{ json: {} }, "Torrentio returned an invalid stream list."],
  ]) {
    response = next;
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText(message)).toBeVisible();
  }
  delay = true;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByText("Torrentio took too long to respond. Try again."),
  ).toBeVisible();
  expect(await history(page)).toHaveLength(0);
});
