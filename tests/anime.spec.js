import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

function date(offset = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
const anime = {
  id: 505,
  name: "Test Anime",
  media_type: "tv",
  original_language: "ja",
  genre_ids: [16],
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  overview: "Anime synopsis",
  vote_average: 8,
  first_air_date: "2026-10-01",
};

for (const [mode, width] of [
  ["web", 390],
  ["web", 1440],
  ["desktop", 1440],
  ["android", 390],
])
  test(`${mode} anime catalog and episode schedule at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    if (mode !== "web") {
      await page.route("**/src/platform/index.js*", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: `export const isDesktop=${mode === "desktop"}; export const isAndroid=${mode === "android"}; export const isNativeApp=true; export const browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
        }),
      );
    }
    const titles = Array.from({ length: 13 }, (_, index) => ({
      ...anime,
      id: 505 + index,
      name: index ? `Test Anime ${index + 1}` : anime.name,
    }));
    titles.push(
      { ...anime, id: 900, name: "Adult Anime", adult: true },
      {
        ...anime,
        id: 901,
        name: "Misclassified Anime",
        adult: false,
        keywords: { results: [{ id: 100, name: "hentai" }] },
      },
    );
    await page.route("https://api.themoviedb.org/3/**", (route) => {
      const url = new URL(route.request().url());
      if (/\/tv\/\d+$/.test(url.pathname))
        return route.fulfill({
          json: {
            ...titles.find((item) => url.pathname.endsWith(`/tv/${item.id}`)),
            last_episode_to_air: {
              season_number: 2,
              episode_number: 3,
              air_date: date(-1),
              name: "Yesterday",
            },
            next_episode_to_air: {
              season_number: 2,
              episode_number: 4,
              air_date: date(),
              name: "Today",
            },
          },
        });
      if (url.pathname.includes("/trending/"))
        return route.fulfill({
          json: {
            results: [
              ...titles,
              { ...anime, id: 999, original_language: "en", name: "Not Anime" },
            ],
          },
        });
      if (url.pathname.endsWith("/discover/tv"))
        return route.fulfill({ json: { results: titles } });
      return route.fulfill({ json: { results: [] } });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/#/anime");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: "RainFlix Anime", exact: true }),
    ).toBeVisible();
    if (width >= 1024) {
      await expect(
        page
          .getByRole("navigation", { name: "Primary navigation", exact: true })
          .getByRole("link")
          .nth(1),
      ).toHaveText("Anime");
    } else {
      await expect(
        page
          .getByRole("navigation", {
            name: "Mobile primary navigation",
            exact: true,
          })
          .getByRole("link")
          .nth(1),
      ).toHaveText("Anime");
    }
    await expect(
      page.getByRole("link", { name: "Watch now" }).first(),
    ).toHaveAttribute("href", /title\/tv\/505/);
    for (let i = 0; i < 4; i++) {
      if (!(await page.locator('[data-viewport-catalog="pending"]').count()))
        break;
      const pending = await page
        .locator('[data-viewport-catalog="pending"]')
        .first()
        .elementHandle();
      if (!pending) break;
      await pending.scrollIntoViewIfNeeded();
      await expect
        .poll(() => pending.getAttribute("data-viewport-catalog"))
        .toBe("loaded");
    }
    const recent = page.getByRole("region", {
      name: "Recently updated episodes",
    });
    await expect(recent.locator(".catalog-card")).toHaveCount(
      width < 1024 ? 9 : 10,
    );
    await expect(recent.getByRole("link").first()).toHaveAttribute(
      "href",
      /season=2&episode=3/,
    );
    const recentHeight = (await recent.boundingBox()).height;
    await recent
      .getByRole("button", { name: "Next Recently updated episodes page" })
      .click();
    await expect(recent.locator(".catalog-card")).toHaveCount(
      width < 1024 ? 4 : 3,
    );
    expect(
      Math.abs((await recent.boundingBox()).height - recentHeight),
    ).toBeLessThanOrEqual(1);
    await recent
      .getByRole("button", { name: "Previous Recently updated episodes page" })
      .click();
    await expect(recent.locator(".catalog-card")).toHaveCount(
      width < 1024 ? 9 : 10,
    );
    const ranks = page.getByRole("complementary", {
      name: "Trending anime this week",
    });
    await expect(ranks.locator("li")).toHaveCount(10);
    const newest = page.getByRole("region", { name: "New anime", exact: true });
    await expect(newest.locator(".catalog-card")).toHaveCount(
      width < 1024 ? 9 : 12,
    );
    if (width >= 1024) {
      const recentBox = await recent.boundingBox();
      const newBox = await newest.boundingBox();
      expect(newBox.width).toBeGreaterThan(recentBox.width + 200);
    }
    const newestHeight = (await newest.boundingBox()).height;
    await newest.getByRole("button", { name: "Next New anime page" }).click();
    await expect(newest.locator(".catalog-card")).toHaveCount(
      width < 1024 ? 4 : 1,
    );
    expect(
      Math.abs((await newest.boundingBox()).height - newestHeight),
    ).toBeLessThanOrEqual(1);
    const schedule = page.getByRole("region", {
      name: "Episode release schedule",
    });
    await schedule.scrollIntoViewIfNeeded();
    await expect(
      schedule.getByRole("link", { name: /Test Anime/ }).first(),
    ).toHaveAttribute("href", /season=2&episode=4/);
    await schedule.getByRole("tab").nth(1).click();
    await expect(
      schedule.getByText("No episode releases listed for this day."),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "New anime", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Not Anime", { exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath(`anime-${width}.png`),
      fullPage: true,
    });
  });

test("anime feed failures can retry without unrelated fallback titles", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route("**/trending/all/week?**", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/#/anime");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Watch now" })).toHaveCount(0);
});

test("Browse no longer offers Anime or anime-specific genres", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  const requests = [];
  await page.route("**/discover/*?**", (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const movie = url.pathname.endsWith("/movie");
    return route.fulfill({
      json: {
        total_pages: 1,
        results: [
          {
            ...anime,
            id: movie ? 506 : 505,
            media_type: movie ? "movie" : "tv",
            title: "Anime Film",
            release_date: "2026-10-01",
            genre_ids: [16, 35],
          },
          {
            ...anime,
            id: 999,
            name: "Western cartoon",
            original_language: "en",
          },
        ],
      },
    });
  });
  await page.goto("/#/browse?type=anime&genre=comedy&year=2026");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("heading", { name: "Browse 2026 Comedy movies and series" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Type", exact: true }),
  ).toHaveValue("all");
  await expect(
    page.getByRole("option", { name: "Anime", exact: true }),
  ).toHaveCount(0);
  const genres = page.getByRole("combobox", { name: "Genre", exact: true });
  await expect(genres.locator('option[value="reality"]')).toHaveCount(1);
  await expect(genres.locator('option[value="fantasy-scifi"]')).toHaveCount(1);
  await expect(genres.locator('option[value="slice-of-life"]')).toHaveCount(0);
  await expect(genres.locator('option[value="boys-love"]')).toHaveCount(0);
  expect(requests.some((url) => url.pathname.endsWith("/discover/movie"))).toBe(
    true,
  );
  expect(requests.some((url) => url.pathname.endsWith("/discover/tv"))).toBe(
    true,
  );
  expect(
    requests.every((url) => !url.searchParams.has("with_original_language")),
  ).toBe(true);
  await page
    .getByRole("combobox", { name: "Type", exact: true })
    .selectOption("movie");
  await expect(genres).toHaveValue("");
  await expect(genres.locator('option[value="reality"]')).toHaveCount(1);
});

test("anime discovery excludes explicit keywords", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  const discoveries = [];
  await page.route("**/search/keyword?**", (route) => {
    const name = new URL(route.request().url()).searchParams.get("query");
    const id = name === "slice of life" ? 200 : name === "hentai" ? 100 : null;
    return route.fulfill({ json: { results: id ? [{ id, name }] : [] } });
  });
  await page.route("**/discover/*?**", (route) => {
    discoveries.push(new URL(route.request().url()));
    return route.fulfill({
      json: { results: [{ ...anime, genre_ids: [16] }], total_pages: 1 },
    });
  });
  await page.goto("/#/anime");
  await page
    .getByRole("region", { name: "Recently updated episodes" })
    .scrollIntoViewIfNeeded();
  await expect.poll(() => discoveries.length).toBeGreaterThan(0);
  expect(
    discoveries.every(
      (url) =>
        url.searchParams.get("without_keywords") === "100" &&
        url.searchParams.get("with_genres") === "16",
    ),
  ).toBe(true);
});
