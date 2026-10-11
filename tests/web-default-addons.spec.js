import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer } from "./helpers/playback.js";

for (const native of [false, true]) {
  test(`configured web Yastream default ${native ? "does not install on desktop" : "installs and requires source selection"}`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.route("**/scripts/config.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: await response.text() });
    });
    if (native)
      await page.route("**/src/platform/index.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: "export const isNativeApp=true,isAndroid=false,isDesktop=true,browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
        }),
      );
    let manifests = 0,
      media = 0;
    const requests = [];
    await page.route("https://yastream.tamthai.de/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/manifest.json")) {
        manifests++;
        return route.fulfill({
          json: {
            id: "community.yastream",
            name: "Yastream",
            types: ["movie", "series"],
            resources: ["stream"],
            idPrefixes: ["tt", "tmdb"],
            catalogs: [],
          },
        });
      }
      requests.push(url);
      return route.fulfill({
        json: {
          streams: [
            { name: "1080p", url: `${baseURL}/__default__/one.mp4` },
            { name: "720p", url: `${baseURL}/__default__/two.mp4` },
          ],
        },
      });
    });
    await page.route("**/__default__/**", (route) => {
      media++;
      return route.fulfill({
        path: "tests/fixtures/player-sample.mp4",
        contentType: "video/mp4",
      });
    });
    await openPlayer(page);
    if (native) {
      expect(manifests).toBe(0);
      await expect(
        page.getByRole("button", { name: "Play with Yastream" }),
      ).toHaveCount(0);
      return;
    }
    await expect(
      page.getByRole("button", { name: "Play with Yastream" }),
    ).toBeVisible();
    expect(manifests).toBe(1);
    expect(media).toBe(0);
    expect(requests[0]).toContain("/stream/movie/tt0505000.json");
    await page.getByRole("button", { name: "Play with Yastream" }).click();
    await expect(page.locator("button[data-stream-id]")).toHaveCount(2);
    expect(media).toBe(0);
    await page.locator("button[data-stream-id]").first().click();
    await expect(page.locator("#fullscreenPlayback")).toBeVisible();
    await expect.poll(() => media).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Play with Yastream" }),
    ).toBeVisible();
    const count = await page.evaluate(async () =>
      (await import("/src/lib/addon-storage.js"))
        .addonRegistrations()
        .then((items) => items.length),
    );
    expect(count).toBe(1);
  });
}
