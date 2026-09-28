import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

const catalogAddon = {
  id: "addon:catalog",
  enabled: true,
  manifestUrl: "https://catalog.example/manifest.json",
  manifest: {
    id: "test.catalog",
    name: "Test Catalog",
    types: ["series"],
    resources: ["catalog"],
    catalogs: [
      {
        id: "featured",
        type: "series",
        name: "Featured shows",
        extra: [
          { name: "search" },
          { name: "genre", options: ["Drama", "Sci Fi"] },
          { name: "skip" },
        ],
      },
      {
        id: "search",
        type: "series",
        name: "Search collection",
        extra: [{ name: "search", isRequired: true }],
      },
    ],
  },
};
const metadataAddon = {
  id: "addon:meta",
  enabled: true,
  manifestUrl: "https://metadata.example/manifest.json",
  manifest: {
    id: "test.meta",
    name: "Test Metadata",
    types: ["series", "movie"],
    resources: [
      {
        name: "meta",
        types: ["series", "movie"],
        idPrefixes: ["custom:", "tt"],
      },
    ],
  },
};
const streamAddon = {
  id: "addon:stream",
  enabled: true,
  manifestUrl: "https://streams.example/manifest.json",
  manifest: {
    id: "test.stream",
    name: "Custom Streams",
    types: ["series"],
    resources: [{ name: "stream", types: ["series"], idPrefixes: ["video:"] }],
  },
};
const preview = {
  id: "custom:show",
  type: "series",
  name: "Catalog Show",
  poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
};
const metadata = {
  ...preview,
  description: "Details supplied by a separate metadata add-on.",
  cast: ["Sample Actor"],
  releaseInfo: "2025",
  genres: ["Drama"],
  videos: [
    { id: "video:custom/one", title: "First episode", season: 1, episode: 1 },
    {
      id: "video:custom/two",
      title:
        "Second episode with a very long title that must remain inside its mobile control",
      season: 2,
      episode: 1,
    },
  ],
};

async function setup({ page, baseURL }) {
  await mockPlayback({ page, baseURL }, false);
  await page.addInitScript(
    (addons) =>
      sessionStorage.setItem(
        "rainflix:addons:session:v1",
        JSON.stringify(addons),
      ),
    [catalogAddon, metadataAddon, streamAddon],
  );
  await page.route("https://metadata.example/**", (route) =>
    route.fulfill({ json: { meta: metadata } }),
  );
  await page.route("https://stremio-addons.net/api/v0/**", (route) =>
    route.fulfill({ json: { categories: [], addons: [] } }),
  );
}

test("catalog filters, custom metadata and episode identities work on mobile", async ({
  page,
  baseURL,
}, testInfo) => {
  await setup({ page, baseURL });
  await page.setViewportSize({ width: 390, height: 844 });
  const catalogRequests = [];
  await page.route("https://catalog.example/**", (route) => {
    catalogRequests.push(route.request().url());
    return route.fulfill({
      json: { metas: [preview, preview, { name: "Invalid" }] },
    });
  });
  const streamRequests = [];
  await page.route("https://streams.example/**", (route) => {
    streamRequests.push(route.request().url());
    return route.fulfill({
      json: {
        streams: [
          {
            name: "Sample stream",
            url: `${baseURL}/__media__/player-sample.mp4`,
          },
        ],
      },
    });
  });
  let mediaRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/__media__/")) mediaRequests++;
  });
  await page.goto("/#/addon/addon%3Acatalog/catalog/series/featured");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("link", { name: "More information about Catalog Show" }),
  ).toHaveCount(1);
  await page.getByLabel("search", { exact: true }).fill("A & B");
  await page
    .getByRole("combobox", { name: "genre", exact: true })
    .selectOption("Sci Fi");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect
    .poll(() =>
      catalogRequests.some(
        (url) =>
          url.includes("search=A%20%26%20B") && url.includes("genre=Sci%20Fi"),
      ),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect
    .poll(() => catalogRequests.some((url) => url.includes("skip=3")))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("addon-catalog-mobile.png"),
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "More information about Catalog Show" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Catalog Show", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.getByText(metadata.description)).toBeVisible();
  await expect(page.getByLabel("Metadata provider")).toHaveCount(0);
  expect(streamRequests).toHaveLength(0);
  expect(mediaRequests).toBe(0);
  await page.getByRole("button", { name: "Play with Custom Streams" }).click();
  await expect
    .poll(() => streamRequests)
    .toEqual([
      "https://streams.example/stream/series/video%3Acustom%2Fone.json",
    ]);
  await expect.poll(() => mediaRequests).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Close player" }).click();
  await page
    .getByRole("combobox", { name: "Season", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Play with Custom Streams" }).click();
  await expect
    .poll(() => streamRequests.at(-1))
    .toBe("https://streams.example/stream/series/video%3Acustom%2Ftwo.json");
  await expect(page.locator("#playerShell video")).toBeVisible();
  await page.getByRole("button", { name: "Close player" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("addon-title-mobile.png"),
    fullPage: true,
  });
  await page.goBack();
  await expect(
    page.getByRole("combobox", { name: "Season", exact: true }),
  ).toHaveValue("1");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Catalog Show", exact: true, level: 1 }),
  ).toBeVisible({ timeout: 15000 });
});

test("required catalog extras gate requests and errors can be retried", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  let requests = 0;
  await page.route("https://catalog.example/**", (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({ status: 500 })
      : route.fulfill({ json: { metas: [] } });
  });
  await page.goto("/#/addon/addon%3Acatalog/catalog/series/search");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByText("Choose search to browse this catalog."),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByLabel("search *", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("alert")).toContainText("500");
  await page.getByRole("button", { name: "Retry catalog" }).click();
  await expect(page.getByText("No titles found.")).toBeVisible();
});

test("home adds catalogs and disabling the owner removes them", async ({
  page,
  baseURL,
}, testInfo) => {
  await setup({ page, baseURL });
  const requests = [];
  await page.route("https://catalog.example/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({ json: { metas: [preview] } });
  });
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: "Featured shows - Series", exact: true }),
  ).toBeVisible();
  expect(requests.some((url) => url.includes("/series/search"))).toBe(false);
  await page
    .getByRole("region", {
      name: "Test Catalog: Featured shows - Series",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("addon-home-desktop.png"),
    fullPage: true,
  });
  await page.evaluate(() => {
    location.hash = "/addons";
  });
  await page.getByRole("tab", { name: /Installed/ }).click();
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Test Catalog", exact: true }),
    })
    .getByRole("checkbox", { name: "Enabled" })
    .uncheck();
  await page.evaluate(() => {
    location.hash = "/home";
  });
  await expect(
    page.getByRole("heading", { name: "Featured shows - Series", exact: true }),
  ).toHaveCount(0);
});

test("custom metadata can supply inline streams without persisting them", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  let metadataCalls = 0;
  await page.route("https://metadata.example/**", (route) => {
    metadataCalls++;
    return route.fulfill({
      json: {
        meta: {
          id: "custom:movie",
          type: "movie",
          name: "Add-on Movie Details",
          description: "Alternate movie metadata",
          videos: [
            {
              id: "inline:movie",
              title: "Full movie",
              streams: [
                {
                  name: "Metadata stream",
                  url: `${baseURL}/__media__/player-sample.mp4`,
                },
              ],
            },
          ],
        },
      },
    });
  });
  let mediaRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/__media__/")) mediaRequests++;
  });
  await page.goto("/#/watch/movie/505/1/1");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  expect(metadataCalls).toBe(0);
  await page.goto("/#/addon/addon%3Ameta/title/movie/custom%3Amovie");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: "Add-on Movie Details", level: 1 }),
  ).toBeVisible();
  expect(mediaRequests).toBe(0);
  await page.getByRole("button", { name: "Play with Test Metadata" }).click();
  await expect.poll(() => mediaRequests).toBeGreaterThan(0);
  await page.goBack();
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await expect(page).toHaveURL(/title\/movie\/custom%3Amovie$/);
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("player-sample.mp4");
  expect(stored).not.toContain("Add-on Movie Details");
});
