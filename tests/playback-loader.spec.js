import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

test.beforeEach(async ({ page, baseURL }) => {
  await mockPlayback({ page, baseURL });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Use window fullscreen"));
  });
  await page.route("https://api.themoviedb.org/3/movie/505?*", (route) =>
    route.fulfill({
      json: {
        id: 505,
        title: "Playback Test",
        external_ids: { imdb_id: "tt0505000" },
        images: {
          logos: [{ file_path: "/buffering-logo.png", iso_639_1: "en" }],
        },
      },
    }),
  );
  await page.route("https://image.tmdb.org/**/buffering-logo.png", (route) =>
    route.fulfill({
      path: "assets/rainflix-wordmark.png",
      contentType: "image/png",
    }),
  );
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              {
                name: "Test stream",
                url: `${baseURL}/__media__/player-sample.mp4`,
              },
            ],
          }
        : { subtitles: [] },
    }),
  );
});

async function simulateBuffer(page, seconds = 2) {
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((node) => node.readyState))
    .toBeGreaterThanOrEqual(3);
  await video.evaluate((node, seconds) => {
    node.pause();
    window.__bufferSeconds = seconds;
    Object.defineProperties(node, {
      duration: { configurable: true, get: () => 40 },
      currentTime: { configurable: true, get: () => 10 },
      buffered: {
        configurable: true,
        get: () => ({
          length: 1,
          start: () => 10,
          end: () => 10 + window.__bufferSeconds,
        }),
      },
    });
    node.dispatchEvent(new Event("waiting"));
  }, seconds);
  return video;
}

for (const width of [390, 1440]) {
  test(`buffering fills the title logo from left to right at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openPlayer(page);
    await selectPlayer(page, "yastream");
    const video = await simulateBuffer(page);
    const loader = page.getByRole("progressbar", {
      name: /Playback Test: Buffering/,
    });
    await expect(loader).toHaveAttribute("aria-valuenow", "25");
    await expect(loader.locator("img")).toHaveCount(2);
    await expect
      .poll(() =>
        loader
          .locator("img")
          .first()
          .evaluate((image) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    await video.evaluate((node) => {
      window.__bufferSeconds = 4;
      node.dispatchEvent(new Event("progress"));
    });
    await expect(loader).toHaveAttribute("aria-valuenow", "50");
    await expect
      .poll(() =>
        loader
          .locator(".playback-logo-fill")
          .evaluate((node) => getComputedStyle(node).clipPath),
      )
      .toBe("inset(0px 50% 0px 0px)");
    await page.screenshot({
      path: testInfo.outputPath(`buffering-${width}.png`),
    });
    await video.evaluate((node) => node.dispatchEvent(new Event("canplay")));
    await expect(loader).toHaveCount(0);
    await expect(page.locator(".playback-loader")).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    await video.evaluate((node) => {
      window.__bufferSeconds = 1;
      node.dispatchEvent(new Event("waiting"));
    });
    await expect(loader).toHaveAttribute("aria-valuenow", "13");
    await page
      .getByRole("button", { name: "Close player", exact: true })
      .click();
    await expect(page.locator(".playback-loader")).toHaveCount(0);
  });
}

test("missing artwork falls back to the title during buffering", async ({
  page,
}) => {
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  await simulateBuffer(page);
  const loader = page.getByRole("progressbar");
  await loader
    .locator("img")
    .first()
    .evaluate((image) => image.dispatchEvent(new Event("error")));
  await expect(loader.locator("img")).toHaveCount(0);
  await expect(loader.locator(".opacity-25")).toHaveText("Playback Test");
});

test("iframe startup pulses without inventing buffer progress", async ({
  page,
}) => {
  let release;
  const ready = new Promise((resolve) => {
    release = resolve;
  });
  await page.route("https://vidsrc.to/**", async (route) => {
    await ready;
    await route.fulfill({
      contentType: "text/html",
      body: "<html><body>Embed test</body></html>",
    });
  });
  await openPlayer(page);
  await selectPlayer(page, "vidsrc");
  const loader = page.getByRole("progressbar");
  await expect(loader).toBeVisible();
  await expect(loader).not.toHaveAttribute("aria-valuenow");
  await expect(loader.locator(".playback-logo")).toHaveClass(/is-buffering/);
  await expect(loader.locator(".playback-logo-fill")).toHaveCSS(
    "clip-path",
    "inset(0px 100% 0px 0px)",
  );
  release();
  await expect(loader).toHaveCount(0);
});
