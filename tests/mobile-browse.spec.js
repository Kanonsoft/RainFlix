import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("mobile search loads the next page on scroll and fits three cards", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockPlayback({ page, baseURL }, false);
  const requests = [];
  await page.route("https://api.themoviedb.org/3/search/multi**", (route) => {
    const number = Number(
      new URL(route.request().url()).searchParams.get("page"),
    );
    requests.push(number);
    return route.fulfill({
      json: {
        page: number,
        total_pages: 2,
        results: Array.from({ length: 20 }, (_, index) => ({
          id: number * 100 + index,
          title: `Search title ${number}-${index}`,
          media_type: "movie",
          poster_path: "/poster.jpg",
          release_date: "2024-01-01",
          vote_average: 7.5,
        })),
      },
    });
  });
  await page.goto("/#/search?q=Search");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
  await expect(page.locator(".catalog-grid .catalog-card")).toHaveCount(20);
  const cards = await page
    .locator(".catalog-grid .catalog-card")
    .evaluateAll((nodes) =>
      nodes.slice(0, 3).map((node) => ({
        x: node.getBoundingClientRect().x,
        y: node.getBoundingClientRect().y,
      })),
    );
  expect(new Set(cards.map((card) => card.y)).size).toBe(1);
  expect(cards[2].x).toBeGreaterThan(cards[1].x);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".catalog-grid .catalog-card")).toHaveCount(40);
  expect(requests).toEqual([1, 2]);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("drawer exposes Browse instead of separate genre menus on narrow phones", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockPlayback({ page, baseURL }, false);
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
  await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.getByRole("navigation", {
    name: "Mobile primary navigation",
  });
  await expect(
    nav.getByRole("button", { name: "Genres", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("link", { name: "Browse", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Genre" })).toBeVisible();
  await expect(page.getByRole("search")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
