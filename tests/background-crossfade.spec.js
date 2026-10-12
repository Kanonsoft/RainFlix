import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const mode of ["web", "desktop", "android"]) {
  test(`${mode} ambient crossfades keep dimming constant through layer cleanup`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    if (mode !== "web")
      await page.route("**/src/platform/index.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export const isNativeApp=true,isDesktop=${mode === "desktop"},isAndroid=${mode === "android"},browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
        }),
      );
    await page.route("https://api.themoviedb.org/3/movie/*?*", (route) => {
      const id = Number(
        new URL(route.request().url()).pathname.split("/").at(-1),
      );
      return route.fulfill({
        json: {
          id,
          title: `Backdrop ${id}`,
          backdrop_path: `/backdrop-${id}.jpg`,
          poster_path: "/poster.jpg",
        },
      });
    });
    await page.goto("/#/title/movie/505");
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "opacity",
      "1",
    );
    await expect(page.locator(".ambient-backdrop")).toHaveCSS(
      "opacity",
      "0.25",
    );
    await page.evaluate(() => {
      location.hash = "/title/movie/506";
    });
    await expect(page.locator(".ambient-backdrop-previous")).toHaveCount(1);
    const coverage = async (time) =>
      page.evaluate((time) => {
        const root = document.querySelector(".ambient-backdrop");
        const current = root.querySelector(".ambient-backdrop-current");
        const animation = current.getAnimations()[0];
        if (animation) {
          animation.pause();
          animation.currentTime = time;
        }
        const previous = root.querySelector(".ambient-backdrop-previous");
        const incoming = Number(getComputedStyle(current).opacity);
        const outgoing = previous
          ? Number(getComputedStyle(previous).opacity)
          : 0;
        return (
          Number(getComputedStyle(root).opacity) *
          (incoming + outgoing * (1 - incoming))
        );
      }, time);
    expect(await coverage(0)).toBeCloseTo(0.25, 5);
    expect(await coverage(460)).toBeCloseTo(0.25, 5);
    expect(await coverage(920)).toBeCloseTo(0.25, 5);
    await expect(page.locator(".ambient-backdrop-previous")).toHaveCount(0);
    expect(await coverage(920)).toBeCloseTo(0.25, 5);
  });
}
