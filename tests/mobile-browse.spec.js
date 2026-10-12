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

test("bottom navigation exposes Browse on narrow phones and keeps Search on top", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await mockPlayback({ page, baseURL }, false);
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation", {
    name: "Mobile primary navigation",
  });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button", { name: "Search titles" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("banner").getByRole("button", { name: "Search titles" }),
  ).toBeVisible();
  await expect(
    nav.getByRole("button", { name: "Genres", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("link", { name: "Browse", exact: true }).click();
  await expect(
    nav.getByRole("link", { name: "Browse", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("combobox", { name: "Genre" })).toBeVisible();
  await expect(page.getByRole("search")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("touch Browse hides counts and hover effects while inputs remain editable", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await mockPlayback({ page, baseURL }, false);
    await page.route("https://api.themoviedb.org/3/discover/**", (route) =>
      route.fulfill({
        json: {
          page: 1,
          total_pages: 1,
          results: [
            {
              id: 601,
              title: "Touch title",
              name: "Touch title",
              poster_path: "/poster.jpg",
              vote_average: 8,
              release_date: "2024-01-01",
            },
          ],
        },
      }),
    );
    await page.goto("/#/browse?type=movie&year=2024");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
    const card = page.locator(".catalog-grid .catalog-card").first();
    await expect(card).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia("(hover: hover)").matches),
    ).toBe(false);
    await card.hover();
    await expect(card).toHaveCSS("transform", "none");
    await expect(card.locator("img")).toHaveCSS("transform", "none");
    await expect(page.locator("body")).toHaveCSS("user-select", "none");
    await expect(
      page
        .getByRole("region", { name: "Browse catalog" })
        .locator("h2")
        .locator("..")
        .locator(":scope > span"),
    ).toHaveCount(0);
    await page.goto("/#/search");
    const input = page.getByRole("searchbox").last();
    await expect(input).toHaveCSS("user-select", "text");
    await input.fill("Editable title");
    await expect(input).toHaveValue("Editable title");
  } finally {
    await context.close();
  }
});
