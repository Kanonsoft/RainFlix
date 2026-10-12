import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const type of ["movie", "tv"]) {
  test(`newest ${type} appends cards and Back returns to its catalog`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await mockPlayback({ page, baseURL }, false);
    await page.setViewportSize({ width: 390, height: 844 });
    const requests = [];
    await page.route(
      `https://api.themoviedb.org/3/discover/${type}?*`,
      (route) => {
        const number = Number(
          new URL(route.request().url()).searchParams.get("page") || 1,
        );
        requests.push(number);
        return route.fulfill({
          json: {
            page: number,
            total_pages: 2,
            results: Array.from({ length: 20 }, (_, index) => ({
              id: index === 0 && number === 1 ? 505 : number * 1000 + index,
              title: `Newest ${index}`,
              name: `Newest ${index}`,
              poster_path: "/poster.jpg",
              backdrop_path: "/backdrop.jpg",
              release_date: "2025-01-01",
              first_air_date: "2025-01-01",
              vote_average: 8,
              vote_count: 100,
            })),
          },
        });
      },
    );
    await page.goto(`/#/newest/${type}`);
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(page.locator(".catalog-grid article")).toHaveCount(20);
    await page.locator(".catalog-grid article a").first().click();
    await expect(page).toHaveURL(new RegExp(`#/title/${type}/505`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`#/newest/${type}$`));
    await expect(page.locator(".catalog-grid article")).toHaveCount(20);
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await expect(page.locator(".catalog-grid article")).toHaveCount(40);
    expect(requests).toContain(2);
    await page.screenshot({
      path: testInfo.outputPath(`newest-${type}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("direct title Back stays in RainFlix and closes the trailer before navigating", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.goto("/#/title/movie/505");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "Play trailer", exact: true }).click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await expect(page).toHaveURL(/#\/title\/movie\/505$/);
  await expect(
    page.getByRole("button", { name: "Back to previous page" }),
  ).toHaveCount(0);
  await page.evaluate(() => window.rainflixNavigateBack());
  await expect(page).toHaveURL(/#\/home$/);
});
