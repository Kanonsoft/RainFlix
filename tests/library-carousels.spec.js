import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const width of [390, 1440]) {
  test(`home history and every library section scroll sideways at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await mockPlayback({ page, baseURL }, false, true);
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const isNativeApp=true,isDesktop=true,isAndroid=false,browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      const titles = (offset) =>
        Array.from({ length: 12 }, (_, index) => ({
          id: offset + index,
          mediaType: "movie",
          title: `Title ${offset + index}`,
          poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
          season: 1,
          episode: 1,
          viewedAt: Date.now(),
          watchedAt: Date.now(),
          savedAt: Date.now(),
        }));
      localStorage.setItem("rainflix:my-list:v1", JSON.stringify(titles(2000)));
      localStorage.setItem(
        "rainflix:recently-viewed:v1",
        JSON.stringify(titles(3000)),
      );
      localStorage.setItem(
        "rainflix:watched:v1",
        JSON.stringify(
          titles(4000).map((item) => ({ ...item, markedWatched: true })),
        ),
      );
    });
    const check = async (carousel) => {
      await carousel.scrollIntoViewIfNeeded();
      await expect(carousel).toBeVisible();
      expect(
        await carousel.evaluate(
          (element) => element.scrollWidth > element.clientWidth,
        ),
      ).toBe(true);
      await carousel.evaluate((element) => {
        element.scrollLeft = element.clientWidth;
      });
      await expect
        .poll(() => carousel.evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    await page.goto("/#/home");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await check(
      page.getByRole("group", { name: "Continue watching", exact: true }),
    );
    await page.getByRole("link", { name: "My List", exact: true }).click();
    for (const name of ["Saved titles", "Continue watching", "Watched titles"])
      await check(page.getByRole("group", { name, exact: true }));
    await page.screenshot({
      path: testInfo.outputPath(`library-${width}.png`),
      fullPage: true,
    });
  });
}
