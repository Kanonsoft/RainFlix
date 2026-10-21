import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("mobile starts one cached poster wall and retires all loader work", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  try {
    await mockPlayback({ page, baseURL }, false);
    await page.route("**/src/lib/startup-artwork.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export const seedPosters=['/rainflix-r.png?seed'];
        export async function startupPosters(){return await new Promise(resolve=>{window.finishPosterCache=()=>resolve(['/rainflix-r.png?cached']);});}
        export async function refreshStartupArtwork(){} export async function clearArtworkCache(){}`,
      }),
    );
    await page.clock.install();
    await page.goto("/#/home");
    await expect
      .poll(() => page.evaluate(() => Boolean(window.finishPosterCache)))
      .toBe(true);
    await expect(page.locator(".app-loader-wall")).toHaveCount(0);
    await expect(page.locator("#startupFallback")).toHaveCount(0);
    await page.evaluate(() => window.finishPosterCache());
    await expect(page.locator(".app-loader-wall")).toHaveCount(1);
    const images = page.locator(".app-loader-card img");
    await expect(images).toHaveCount(70);
    expect(
      await images.evaluateAll((items) =>
        items.every((image) => image.src.endsWith("?cached")),
      ),
    ).toBe(true);
    await page.clock.runFor(4500);
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
    await expect(
      page.locator("#appLoader img, #appLoader .app-loader-bar"),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.effect?.target?.closest?.("#appLoader"),
            ).length,
      ),
    ).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 650));
    await page.clock.runFor(50);
    await expect(page.locator("#site-header")).toHaveClass(/is-scrolled/);
    expect(
      await page
        .locator("#site-header")
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe("none");
    expect(
      await page
        .locator(".mobile-bottom-nav")
        .evaluate((element) => getComputedStyle(element).backdropFilter),
    ).toBe("none");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/mobile-startup-performance.png",
    });
  } finally {
    await context.close();
  }
});
