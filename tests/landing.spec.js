import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const width of [320, 390, 1440]) {
  test(`landing scene renders and navigates at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "RainFlix", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#appLoader")).toHaveCount(0);
    await expect(page.locator(".landing-scene canvas")).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          [...document.querySelectorAll(".landing-scene img")].every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    await page.waitForTimeout(1000);
    const pixels = await page
      .locator(".landing-scene canvas")
      .evaluate((canvas) => {
        const gl = canvas.getContext("webgl2");
        const data = new Uint8Array(
          gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
        );
        gl.readPixels(
          0,
          0,
          gl.drawingBufferWidth,
          gl.drawingBufferHeight,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          data,
        );
        return data.some((value) => value > 0);
      });
    await page.screenshot({
      path: test.info().outputPath(`landing-${width}.png`),
    });
    expect(pixels).toBe(true);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const before = await page.locator(".landing-scene canvas").screenshot();
    await page.mouse.move(width - 1, 500);
    await page.waitForTimeout(500);
    const after = await page.locator(".landing-scene canvas").screenshot();
    expect(before.equals(after)).toBe(false);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".landing-actions")
      .getByRole("link", { name: "Open RainFlix" })
      .click();
    await expect(page).toHaveURL(/#\/home$/);
    await page
      .getByRole("button", { name: "Search titles", exact: true })
      .click();
    await page.locator("#globalSearch").fill("   ");
    await page.locator("#globalSearch").press("Enter");
    await expect(page).toHaveURL(/#\/home$/);
  });
}
