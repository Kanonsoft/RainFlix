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

async function revealHomeCatalogs(page) {
  for (let index = 0; index < 20; index++) {
    const pending = page.locator('[data-viewport-catalog="pending"]').first();
    if (!(await pending.count())) break;
    const slot = await pending.elementHandle();
    await slot.scrollIntoViewIfNeeded();
    await expect
      .poll(() => slot.getAttribute("data-viewport-catalog"))
      .toBe("loaded");
  }
}
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

async function setup(
  { page, baseURL },
  addons = [catalogAddon, metadataAddon, streamAddon],
) {
  await mockPlayback({ page, baseURL }, false);
  await page.addInitScript(
    (addons) =>
      sessionStorage.setItem(
        "rainflix:addons:session:v1",
        JSON.stringify(addons),
      ),
    addons,
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
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
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
  await page.locator('[data-video-id][aria-pressed="true"]').click();
  await expect
    .poll(() => streamRequests)
    .toEqual([
      "https://streams.example/stream/series/video%3Acustom%2Fone.json",
    ]);
  await expect.poll(() => mediaRequests).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.locator("#playerShell video").evaluate((video) => video.currentTime),
    )
    .toBeGreaterThan(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play with Custom Streams" }).click();
  await page
    .getByRole("combobox", { name: "Season", exact: true })
    .selectOption("2");
  await page.locator('[data-video-id][aria-pressed="true"]').click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect
    .poll(() => streamRequests.at(-1))
    .toBe("https://streams.example/stream/series/video%3Acustom%2Ftwo.json");
  await expect(page.locator("#playerShell video")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Play with Custom Streams" }).click();
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
    page.getByRole("button", { name: "Play with Custom Streams" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Featured shows - Series", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("search", { exact: true })).toHaveValue("A & B");
  await page
    .getByRole("link", { name: "More information about Catalog Show" })
    .click();
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

test("catalog scroll appends unique batches and stops on repeated results", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  await page.setViewportSize({ width: 390, height: 844 });
  const offsets = [];
  await page.route("https://catalog.example/**", (route) => {
    const offset = Number(
      /skip=(\d+)/.exec(decodeURIComponent(route.request().url()))?.[1] || 0,
    );
    offsets.push(offset);
    const batch = offset === 0 ? 0 : 24;
    return route.fulfill({
      json: {
        metas: Array.from({ length: 24 }, (_, index) => ({
          ...preview,
          id: `custom:${batch + index}`,
          name: `Show ${batch + index}`,
        })),
      },
    });
  });
  await page.goto("/#/addon/addon%3Acatalog/catalog/series/featured");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(page.locator(".catalog-grid article")).toHaveCount(24);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".catalog-grid article")).toHaveCount(48);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => offsets).toEqual([0, 24, 48]);
  await expect(page.locator(".catalog-grid article")).toHaveCount(48);
  await expect(
    page.getByRole("button", { name: /Next page|Previous page/ }),
  ).toHaveCount(0);
  await expect(page).not.toHaveURL(/skip=/);
});

test("home hides empty, invalid, failed and input-only catalog rows", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL }, [
    {
      ...catalogAddon,
      manifest: {
        ...catalogAddon.manifest,
        catalogs: [
          ...catalogAddon.manifest.catalogs,
          ...["empty", "invalid", "failed"].map((id) => ({
            id,
            type: "series",
            name: id,
          })),
        ],
      },
    },
  ]);
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const requests = [];
  await page.route("https://catalog.example/**", async (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.endsWith("/failed.json")) return route.fulfill({ status: 500 });
    if (url.endsWith("/empty.json"))
      return route.fulfill({ json: { metas: [] } });
    if (url.endsWith("/invalid.json"))
      return route.fulfill({ json: { metas: [{ name: "No ID" }] } });
    await pending;
    return route.fulfill({ json: { metas: [preview] } });
  });
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  expect(requests).toHaveLength(0);
  await revealHomeCatalogs(page);
  await expect.poll(() => new Set(requests).size).toBe(4);
  await expect(
    page.locator("[data-addon-catalog-row][aria-busy=false]"),
  ).toHaveCount(0);
  await expect(
    page.locator("[data-addon-catalog-row][aria-busy=true]"),
  ).toHaveCount(1);
  release();
  await expect(
    page.getByRole("region", {
      name: "Test Catalog: Featured shows - Series",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /^Test Catalog:/ }),
  ).toHaveCount(1);
  expect(requests.some((url) => url.includes("/series/search"))).toBe(false);
});

for (const width of [390, 1440]) {
  test(`home catalog skeletons align with loaded cards at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await setup({ page, baseURL });
    let release;
    const ready = new Promise((resolve) => {
      release = resolve;
    });
    await page.route("https://catalog.example/**", async (route) => {
      await ready;
      await route.fulfill({
        json: {
          metas: Array.from({ length: 12 }, (_, index) => ({
            ...preview,
            id: `custom:show:${index}`,
            name: `Catalog Show ${index}`,
          })),
        },
      });
    });
    await page.goto("/#/home");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await revealHomeCatalogs(page);
    const row = page.locator("[data-addon-catalog-row]");
    await row.scrollIntoViewIfNeeded();
    await expect(row).toHaveAttribute("aria-busy", "true");
    await expect(
      row.getByRole("heading", { name: "Featured shows - Series" }),
    ).toBeVisible();
    const grid = row.locator(".catalog-row");
    await expect(grid.locator(":scope > div[aria-hidden=true]")).toHaveCount(
      12,
    );
    await expect(
      grid.locator(":scope > div[aria-hidden=true] > .space-y-2"),
    ).toHaveCount(12);
    const before = await grid.boundingBox();
    const ghost = await grid.locator(":scope > div").first().boundingBox();
    const rowBox = await row.boundingBox();
    expect(before.y + before.height).toBeLessThanOrEqual(
      rowBox.y + rowBox.height + 1,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`catalog-ghost-${width}.png`),
    });
    release();
    await expect(row).toHaveAttribute("aria-busy", "false");
    await expect(grid.locator("article")).toHaveCount(12);
    const after = await grid.boundingBox();
    const card = await grid.locator("article").first().boundingBox();
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.width - ghost.width)).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`catalog-loaded-${width}.png`),
    });
  });
}

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
  expect(requests).toHaveLength(0);
  await expect(
    page.getByRole("heading", { name: "Newest series", exact: true }),
  ).toHaveCount(0);
  await revealHomeCatalogs(page);
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
  await page.getByRole("tab", { name: /^Installed/ }).click();
  await page
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Test Catalog", exact: true }),
    })
    .getByRole("switch", { name: "Enabled" })
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
  await page.getByRole("button", { name: "Full movie", exact: true }).click();
  await page.getByRole("button", { name: "Play with Test Metadata" }).click();
  await expect.poll(() => mediaRequests).toBeGreaterThan(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(1);
  await page.goBack();
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await expect(page).toHaveURL(
    /title\/movie\/custom%3Amovie\?video=inline%3Amovie&selection=streams/,
  );
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("player-sample.mp4");
  expect(stored).toContain("Add-on Movie Details");
  const recent = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1") || "[]"),
  );
  expect(recent[0]).not.toHaveProperty("streams");
});
