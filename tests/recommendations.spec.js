import { expect, test } from "@playwright/test";
import {
  rankSimilarTitles,
  weightedRating,
} from "../src/lib/content-similarity.js";
import { mockPlayback, openPlayer } from "./helpers/playback.js";

const item = {
  id: 1,
  mediaType: "movie",
  poster: "/poster.jpg",
  synopsis: "A detective investigates a murder on a stranded train.",
  genreIds: [9648],
  voteAverage: 8,
  voteCount: 1000,
  originalLanguage: "en",
  keywords: [{ id: 10, name: "murder mystery" }],
  companies: [{ id: 5 }],
  cast: [{ id: 7 }],
  crew: [{ id: 8 }],
  directors: [{ id: 9 }],
};
test("plot and weighted metadata outrank genre-only matches", () => {
  const adjacent = {
    ...item,
    id: 2,
    synopsis: "A detective investigates a murder on a train stranded in snow.",
  };
  const genreOnly = {
    ...item,
    id: 3,
    synopsis: "Spies defend a city from a robotic invasion.",
    keywords: [],
    companies: [],
    cast: [],
    crew: [],
    directors: [],
  };
  const ranked = rankSimilarTitles(item, [genreOnly, adjacent]);
  expect(ranked.map((title) => title.id)).toEqual([2, 3]);
  expect(ranked[0].similarityScore).toBeGreaterThan(ranked[1].similarityScore);
  for (const feature of [
    "keywords",
    "companies",
    "cast",
    "crew",
    "directors",
    "genreIds",
    "originalLanguage",
  ]) {
    const other = {
      ...adjacent,
      id: 4,
      [feature]: feature === "originalLanguage" ? "ja" : [],
    };
    expect(rankSimilarTitles(item, [adjacent, other])[0].id).toBe(2);
  }
});
test("Bayesian ratings shrink small samples and exclude low quality, adults and duplicates", () => {
  expect(weightedRating({ voteAverage: 10, voteCount: 1 })).toBeLessThan(
    weightedRating({ voteAverage: 8, voteCount: 1000 }),
  );
  const good = { ...item, id: 2 };
  expect(
    rankSimilarTitles(item, [
      item,
      good,
      good,
      { ...item, id: 3, adult: true },
      { ...item, id: 4, voteCount: 2 },
      { ...item, id: 5, voteAverage: 4 },
      { ...item, id: 6, mediaType: "tv" },
      { ...item, id: 7, voteAverage: NaN },
    ]).map((title) => title.id),
  ).toEqual([2]);
  expect(
    Number.isFinite(
      rankSimilarTitles({ ...item, synopsis: "", keywords: [] }, [good])[0]
        .similarityScore,
    ),
  ).toBe(true);
});

for (const width of [390, 1440]) {
  test(`content recommendations open a scrollable catalog at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPlayback({ page, baseURL }, false);
    const profile = (id) => ({
      id,
      title: id === 505 ? "Mystery Express" : `Recommended ${id}`,
      overview: "A detective investigates murder aboard a stranded train.",
      genres: [{ id: 9648, name: "Mystery" }],
      genre_ids: [9648],
      original_language: "en",
      keywords: { keywords: [{ id: 10, name: "murder mystery" }] },
      production_companies: [{ id: 5, name: "Studio" }],
      credits: { cast: [{ id: 7 }], crew: [{ id: 9, job: "Director" }] },
      vote_average: 8,
      vote_count: 1000,
      poster_path: "/poster.jpg",
      backdrop_path: "/backdrop.jpg",
      release_date: "2025-01-01",
    });
    const pages = [];
    let active = 0,
      maximum = 0;
    await page.route(
      "https://api.themoviedb.org/3/movie/*?*",
      async (route) => {
        const id = Number(
          new URL(route.request().url()).pathname.split("/").at(-1),
        );
        if (!id) return route.fallback();
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 20));
        await route.fulfill({ json: profile(id) });
        active--;
      },
    );
    await page.route(
      /api\.themoviedb\.org\/3\/(movie\/505\/(similar|recommendations)|discover\/movie)/,
      (route) => {
        const number = Number(
          new URL(route.request().url()).searchParams.get("page") || 1,
        );
        pages.push(number);
        return route.fulfill({
          json: {
            total_pages: 2,
            results: Array.from({ length: 24 }, (_, i) =>
              profile(1000 + (number - 1) * 24 + i),
            ),
          },
        });
      },
    );
    await openPlayer(page);
    await expect(page.locator("#similarCarousel a")).toHaveCount(12);
    await page.getByRole("link", { name: "More recommendations" }).click();
    await expect(page).toHaveURL(/#\/similar\/movie\/505$/);
    await expect(
      page.getByRole("heading", { name: "More like Mystery Express" }),
    ).toBeVisible();
    await expect(page.locator(".catalog-grid article")).toHaveCount(24);
    expect(pages).not.toContain(2);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(".catalog-grid article")).toHaveCount(48);
    expect(pages).toContain(2);
    expect(maximum).toBeLessThanOrEqual(4);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath(`similar-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("link", { name: "Back to title" }).click();
    await expect(page).toHaveURL(/#\/title\/movie\/505$/);
  });
}
test("recommendation failures are retryable without unrelated demo results", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route("https://api.themoviedb.org/3/movie/505?*", (route) =>
    route.fulfill({ status: 503, json: {} }),
  );
  await page.goto("/#/similar/movie/505");
  await expect(page.getByRole("alert")).toContainText(
    "Recommendations could not be loaded",
  );
  await expect(page.locator(".catalog-grid article")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
