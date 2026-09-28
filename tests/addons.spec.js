import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("installs a manifest, gates media behind Play, and removes the provider", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  const manifest = {
    id: "test.streams",
    name: "Test Streams",
    version: "1.0.0",
    types: ["movie"],
    resources: [{ name: "stream", types: ["movie"], idPrefixes: ["tt"] }],
  };
  await page.route("https://stremio-addons.net/api/v0/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("categories")
        ? { categories: [] }
        : {
            addons: [
              {
                uuid: "test",
                manifest,
                manifestUrl: "https://addon.example/manifest.json",
              },
            ],
            pagination: { hasNextPage: false },
          },
    }),
  );
  await page.route("https://addon.example/manifest.json", (route) =>
    route.fulfill({ json: manifest }),
  );
  const requests = [];
  await page.route("https://addon.example/stream/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        streams: [
          { name: "Sample", url: `${baseURL}/__media__/player-sample.mp4` },
        ],
      },
    });
  });
  let mediaRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/__media__/")) mediaRequests++;
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/addons");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await page
    .getByRole("article")
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Test Streams installed",
  );
  expect(requests).toHaveLength(0);
  await page.goto("/#/watch/movie/505/1/1");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("button", { name: "Play with Test Streams" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Play with Torrentio" }),
  ).toHaveCount(0);
  expect(mediaRequests).toBe(0);
  await page.getByRole("button", { name: "Play with Test Streams" }).click();
  await expect
    .poll(() => requests)
    .toEqual(["https://addon.example/stream/movie/tt0505000.json"]);
  await expect.poll(() => mediaRequests).toBeGreaterThan(0);
  await page.goto("/#/addons");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page.getByRole("button", { name: "Remove Test Streams" }).click();
  await expect(page.getByText("No add-ons installed.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
