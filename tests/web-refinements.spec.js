import { test, expect } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

test.beforeEach(mockPlayback);

test("empty providers share one message while availability remains regional", async ({
  page,
}) => {
  await page.route("https://api.country.is/", (route) =>
    route.fulfill({ json: { country: "PH" } }),
  );
  await openPlayer(page);
  await expect(
    page.getByText("No streams found for this title from addons", {
      exact: true,
    }),
  ).toHaveCount(1);
  await expect(
    page.getByText("No official availability listed in Philippines.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/No streams found for this title on/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", {
      name: "RainFlix App free streams - download the app",
    }),
  ).toContainText("Free streams");
});

test("mobile stream selection hides related titles and exits using Escape", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(
    /api\.themoviedb\.org\/3\/movie\/505\/(similar|recommendations)/,
    (route) =>
      route.fulfill({
        json: {
          results: [
            {
              id: 600,
              title: "Related fixture",
              poster_path: "/poster.jpg",
              release_date: "2025-01-01",
            },
          ],
        },
      }),
  );
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "1080p", url: `${baseURL}/__media__/player-sample.mp4` },
          { name: "720p", url: `${baseURL}/__media__/player-sample.mp4?two` },
        ],
      },
    }),
  );
  await openPlayer(page);
  await expect(page.locator("#similarCarousel")).toBeVisible();
  await selectPlayer(page, "yastream");
  await expect(page.locator("#similarCarousel")).toBeHidden();
  await page.locator("button[data-stream-id]").first().click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close player" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Enter fullscreen" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
});
