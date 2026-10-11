import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

test("an outgoing player's fullscreen exit cannot close its replacement", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL });
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
  await openPlayer(page, "tv");
  await page.evaluate(() => {
    window.outgoingFullscreen = document.createElement("div");
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => window.outgoingFullscreen,
    });
    Element.prototype.requestFullscreen = () => Promise.resolve();
  });
  await selectPlayer(page, "yastream");
  await page.evaluate(() => {
    document.dispatchEvent(new Event("fullscreenchange"));
    window.outgoingFullscreen = null;
    document.dispatchEvent(new Event("fullscreenchange"));
  });
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("#playerShell video")
        .evaluate((element) => element.currentTime),
    )
    .toBeGreaterThan(0);
});

test("browser EOF advances an episode and final EOF returns to series details", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL });
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
  await openPlayer(page, "tv");
  await selectPlayer(page, "yastream");
  const video = page.locator("#playerShell video");
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((element) => {
    element.pause();
    element.dispatchEvent(new Event("ended"));
  });
  await expect(page).toHaveURL(/episode=2/);
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await video.evaluate((element) => {
    element.pause();
    element.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await expect(page).toHaveURL(/\/title\/tv\/505/);
  await expect(
    page.getByRole("heading", { name: "Playback Test", exact: true }),
  ).toBeVisible();
});
