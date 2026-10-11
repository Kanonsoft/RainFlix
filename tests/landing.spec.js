import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const width of [320, 390, 1440]) {
  test(`landing trending strip scrolls and navigates at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.route("https://image.tmdb.org/**", (route) =>
      route.fulfill({
        path: "assets/startup/poster-01.jpg",
        contentType: "image/jpeg",
      }),
    );
    await page.route("**/trending/all/week?**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              id: 533535,
              title: "Trending Movie",
              media_type: "movie",
              backdrop_path: "/movie.jpg",
              poster_path: "/poster.jpg",
            },
            {
              id: 1399,
              name: "Trending Series",
              media_type: "tv",
              backdrop_path: "/series.jpg",
              poster_path: "/poster.jpg",
            },
          ],
        },
      }),
    );
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "RainFlix", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#appLoader")).toHaveCount(0);
    await expect(
      page.getByText("Windows & Android apps. A catalog on the web."),
    ).toHaveCount(0);
    await expect(
      page.getByText(
        "Availability depends on your region and the services or add-ons you use.",
      ),
    ).toHaveCount(0);
    await expect(page.locator(".landing-scene, .landing-fallback")).toHaveCount(
      0,
    );
    const strip = page.getByRole("region", {
      name: "Trending this week",
      exact: true,
    });
    await expect(strip).toBeVisible();
    await expect(
      strip.getByRole("link", { name: "Trending Movie", exact: true }),
    ).toHaveCount(1);
    await expect(
      strip.getByRole("link", { name: "Trending Series", exact: true }),
    ).toHaveAttribute("href", /#\/title\/tv\/1399/);
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll(".landing-title img")].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    const track = page.locator(".landing-trending-track");
    await expect(strip.locator(".landing-title span")).toHaveCount(0);
    await expect(strip.locator(".landing-title-logo").first()).toBeVisible();
    await strip
      .getByRole("link", { name: "Trending Movie", exact: true })
      .focus();
    expect(
      await track.evaluate(
        (element) => getComputedStyle(element).animationPlayState,
      ),
    ).toBe("running");
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await page.emulateMedia({ reducedMotion });
      const before = await track.evaluate(
        (element) => getComputedStyle(element).transform,
      );
      await expect
        .poll(() =>
          track.evaluate((element) => getComputedStyle(element).transform),
        )
        .not.toBe(before);
    }
    const stripBox = await strip.boundingBox();
    const featuresBox = await page.locator(".landing-features").boundingBox();
    expect(featuresBox.y + featuresBox.height).toBeLessThanOrEqual(
      stripBox.y + 1,
    );
    await expect(
      page.locator(".landing-features .landing-feature"),
    ).toHaveCount(3);
    await expect(page.locator(".landing-movie-backdrop")).toBeVisible();
    const backdropTop = await page
      .locator(".landing-movie-backdrop")
      .evaluate((element) => element.getBoundingClientRect().top);
    await page.evaluate(() => window.scrollTo(0, 200));
    expect(
      await page
        .locator(".landing-movie-backdrop")
        .evaluate((element) => element.getBoundingClientRect().top),
    ).toBe(backdropTop);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: test.info().outputPath(`landing-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const popupPromise = page.waitForEvent("popup");
    await page
      .locator(".landing-actions")
      .getByRole("link", { name: "Open RainFlix" })
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/#\/home$/);
    await expect(
      page.getByRole("heading", { name: "RainFlix", exact: true }),
    ).toBeVisible();
    await popup.close();
    await page.goto("/#/home");
    await page
      .getByRole("button", { name: "Search titles", exact: true })
      .click();
    await page.locator("#globalSearch").fill("   ");
    await page.locator("#globalSearch").press("Enter");
    await expect(page).toHaveURL(/#\/home$/);
  });
}
