import { expect, test } from "@playwright/test";
import {
  closePlayer,
  mockPlayback,
  openPlayer,
  selectPlayer,
  selectStream,
} from "./helpers/playback.js";

test.beforeEach(async ({ page, baseURL }) => {
  await mockPlayback({ page, baseURL });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Test"));
  });
});

test("positions survive module reloads without storing sources and stay episode-specific", async ({
  page,
}) => {
  await openPlayer(page);
  const result = await page.evaluate(async () => {
    const progress = await import("/src/lib/playback-progress.js");
    const details = {
      tmdbDetails: { id: 505, mediaType: "tv" },
      addonStreams: [{ url: "https://example.test/video?token=private" }],
    };
    const first = progress.playbackIdentity(details, 1, 1);
    const second = progress.playbackIdentity(details, 1, 2);
    progress.savePlaybackProgress(
      first,
      { position: 840, duration: 1800 },
      true,
    );
    const reloaded = await import("/src/lib/playback-progress.js?reload=1");
    const position = reloaded.readPlaybackPosition(first);
    const otherEpisode = reloaded.readPlaybackPosition(second);
    const stored = localStorage.getItem("rainflix:playback-progress:v1");
    progress.savePlaybackProgress(
      first,
      { position: 1800, duration: 1800, completed: true },
      true,
    );
    const completed = progress.readPlaybackPosition(first);
    const custom = progress.playbackIdentity({
      addonType: "series",
      addonId: "custom:test",
      addonVideoId: "custom:test:2",
    });
    progress.savePlaybackProgress(
      custom,
      { position: 90, duration: 1800 },
      true,
    );
    const customPosition = progress.readPlaybackPosition(custom);
    const customPersisted = localStorage
      .getItem("rainflix:playback-progress:v1")
      .includes("custom:");
    progress.clearPlaybackProgress();
    return {
      position,
      otherEpisode,
      stored,
      completed,
      customPosition,
      customPersisted,
      cleared: progress.readPlaybackPosition(first),
    };
  });
  expect(result.position).toBe(840);
  expect(result.otherEpisode).toBe(0);
  expect(result.stored).not.toContain("private");
  expect(result.completed).toBe(0);
  expect(result.customPosition).toBe(90);
  expect(result.customPersisted).toBe(false);
  expect(result.cleared).toBe(0);
});

test("native streams save after playing and seek when switching streams", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() => {
    const time = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime",
    );
    window.__requestedSeeks = [];
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
      ...time,
      set(value) {
        window.__requestedSeeks.push(value);
        time.set.call(this, value);
      },
    });
  });
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [0, 1].map((id) => ({
              name: `Source ${id}`,
              url: `${baseURL}/__media__/player-sample.mp4?source=${id}`,
            })),
          }
        : { subtitles: [] },
    }),
  );
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("rainflix:playback-progress:v1"),
    ),
  ).toBeNull();
  await selectStream(page, "0");
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((node) => node.readyState))
    .toBeGreaterThanOrEqual(3);
  await video.evaluate((node) => {
    node.pause();
    node.dispatchEvent(new Event("playing"));
    node.currentTime = 1;
  });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const values = JSON.parse(
          localStorage.getItem("rainflix:playback-progress:v1") || "[]",
        );
        return values[0]?.[1]?.position;
      }),
    )
    .toBeCloseTo(1);
  await closePlayer(page);
  await page.evaluate(() => {
    window.__requestedSeeks = [];
  });
  await selectStream(page, "1");
  await expect
    .poll(() => page.evaluate(() => window.__requestedSeeks))
    .toContain(1);
  await closePlayer(page);
});

test("iframe resume uses supported parameters and ignores other titles or episodes", async ({
  page,
}) => {
  await openPlayer(page);
  const result = await page.evaluate(async () => {
    const { framePlaybackEvent, resumedFrameUrl } =
      await import("/src/lib/playback-progress.js");
    const details = { tmdbDetails: { id: 505, mediaType: "tv" } };
    const event = {
      type: "PLAYER_EVENT",
      data: {
        event: "timeupdate",
        currentTime: 300,
        duration: 1800,
        mtmdbId: 505,
        mediaType: "tv",
        season: 1,
        episode: 2,
      },
    };
    return {
      url: resumedFrameUrl(
        { id: "vidfast", url: "https://vidfast.vc/tv/505/1/2?sub=en" },
        300,
      ),
      unsupported: resumedFrameUrl(
        { id: "2embed", url: "https://www.2embed.cc/embedtv/505&s=1&e=2" },
        300,
      ),
      match: framePlaybackEvent(JSON.stringify(event), details, 1, 2),
      wrongEpisode: framePlaybackEvent(event, details, 1, 1),
      wrongTitle: framePlaybackEvent(
        event,
        { tmdbDetails: { id: 506, mediaType: "tv" } },
        1,
        2,
      ),
      invalid: framePlaybackEvent(
        { ...event, data: { ...event.data, currentTime: -1 } },
        details,
        1,
        2,
      ),
    };
  });
  expect(new URL(result.url).searchParams.get("startAt")).toBe("300");
  expect(new URL(result.url).searchParams.get("sub")).toBe("en");
  expect(result.unsupported).not.toContain("startAt");
  expect(result.match.sample.position).toBe(300);
  expect(result.wrongEpisode).toBeNull();
  expect(result.wrongTitle).toBeNull();
  expect(result.invalid.sample).toBeNull();
});
