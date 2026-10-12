import { test, expect } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

for (const [mode, width, touch] of [
  ["web", 390],
  ["web", 1440],
  ["desktop", 1440],
  ["android", 390],
  ["web", 390, true],
  ["android", 390, true],
]) {
  test(`${mode} title lists hand ${touch ? "touch" : "wheel"} scrolling back to the page at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL });
    if (mode !== "web")
      await page.route("**/src/platform/index.js", (route) =>
        route.fulfill({
          contentType: "text/javascript",
          body: `export const isNativeApp=true,isDesktop=${mode === "desktop"},isAndroid=${mode === "android"},browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
        }),
      );
    await page.setViewportSize({ width, height: 900 });
    await page.route("https://yastream.tamthai.de/**", (route) =>
      route.fulfill({
        json: {
          streams: Array.from({ length: 30 }, (_, n) => ({
            name: `Stream ${n + 1}`,
            url: `${baseURL}/__media__/player-sample.mp4?n=${n}`,
          })),
        },
      }),
    );
    await openPlayer(page);
    await selectPlayer(page, "yastream");
    await expect(page.locator("button[data-stream-id]")).toHaveCount(30);
    // Reserve page space on both sides to exercise chaining rather than document limits.
    await page.evaluate(() => {
      document.documentElement.style.scrollBehavior = "auto";
      document.getElementById("app-view").style.paddingBottom = "900px";
    });
    const area = page.locator("[data-source-list]");
    const client = touch ? await page.context().newCDPSession(page) : null;
    if (client)
      await client.send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });
    const scroll = async (distance) => {
      if (!client) return page.mouse.wheel(0, distance);
      const bounds = await area.boundingBox();
      const x = bounds.x + bounds.width / 2;
      const y = Math.max(280, Math.min(bounds.y + bounds.height / 2, 600));
      const point = (position) => ({
        x,
        y: position,
        id: 1,
        radiusX: 2,
        radiusY: 2,
        force: 1,
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point(y)],
      });
      for (let step = 1; step <= 12; step++) {
        await client.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [point(y - (distance * step) / 12)],
        });
        // Frame-paced motion lets Chromium recognize a real pan instead of a tap.
        await page.waitForTimeout(16);
      }
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    await area.scrollIntoViewIfNeeded();
    const box = await area.boundingBox();
    await page.mouse.move(
      box.x + box.width / 2,
      Math.min(box.y + box.height / 2, 750),
    );
    const pageStart = await page.evaluate(() => scrollY);
    await scroll(160);
    await expect
      .poll(() => area.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(50);
    expect(
      Math.abs((await page.evaluate(() => scrollY)) - pageStart),
    ).toBeLessThan(2);
    await area.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const beforeDown = await page.evaluate(() => scrollY);
    await scroll(250);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeGreaterThan(beforeDown + 40);
    await area.evaluate((el) => {
      el.scrollTop = 0;
    });
    const moved = await area.boundingBox();
    await page.mouse.move(
      moved.x + moved.width / 2,
      Math.max(120, Math.min(moved.y + moved.height / 2, 750)),
    );
    const beforeUp = await page.evaluate(() => scrollY);
    await scroll(-250);
    await expect
      .poll(() => page.evaluate(() => scrollY))
      .toBeLessThan(beforeUp - 40);
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "filter",
      /blur\(38px\)/,
    );
    await page.route("https://api.themoviedb.org/3/movie/506?*", (route) =>
      route.fulfill({
        json: {
          id: 506,
          title: "Next backdrop",
          backdrop_path: "/next-backdrop.jpg",
          poster_path: "/poster.jpg",
        },
      }),
    );
    await page.evaluate(() => {
      location.hash = "/title/movie/506";
    });
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "background-image",
      /next-backdrop/,
    );
    await expect(page.locator(".ambient-backdrop-previous")).toHaveCSS(
      "filter",
      /blur\(38px\)/,
    );
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "filter",
      /blur\(38px\)/,
    );
    await client?.detach();
  });
}
