import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("desktop applies startup fullscreen and Escape returns to windowed mode", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false, true);
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isNativeApp=true,isAndroid=false,isDesktop=true,browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem(
      "rainflix:settings:v1",
      JSON.stringify({ fullscreenOnStart: true }),
    );
    window.isTauri = true;
    window.fullscreenCalls = [];
    let fullscreen = false;
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      transformCallback: () => 1,
      async invoke(command, args) {
        if (command === "plugin:window|set_fullscreen") {
          fullscreen = args.value;
          window.fullscreenCalls.push(args.value);
        }
        if (command === "plugin:window|is_fullscreen") return fullscreen;
        if (command === "plugin:event|listen") return 1;
      },
    };
  });
  await page.goto("/#/settings");
  await expect
    .poll(() => page.evaluate(() => window.fullscreenCalls))
    .toEqual([true]);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => window.fullscreenCalls))
    .toEqual([true, false]);
  await page
    .getByRole("switch", { name: "Fullscreen on start", exact: true })
    .uncheck();
  await page
    .getByRole("switch", { name: "Fullscreen on start", exact: true })
    .check();
  await expect
    .poll(() => page.evaluate(() => window.fullscreenCalls.at(-1)))
    .toBe(true);
});

for (const android of [true, false])
  test(`native settings defaults and preferences persist on ${android ? "Android" : "desktop"}`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false, true);
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export const isNativeApp=true,isAndroid=${android},isDesktop=${!android},browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#/settings");
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    const reduced = page.getByRole("switch", { name: "Reduce animations" });
    if (android) {
      await expect(reduced).toBeChecked();
      await expect(page.locator(".ambient-backdrop")).toHaveCSS(
        "background-color",
        "rgb(45, 51, 59)",
      );
      await expect(page.locator(".ambient-backdrop-layer")).toHaveCount(0);
    } else await expect(reduced).not.toBeChecked();
    await expect(page.getByLabel("Preferred subtitles")).toHaveValue("en");
    await expect(page.getByLabel("Preferred audio")).toHaveValue("");
    await expect(page.getByText("Storage", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Intro fallback length")).toHaveCount(0);
    if (!android) {
      const fullscreen = page.getByRole("switch", {
        name: "Fullscreen on start",
      });
      await expect(fullscreen).not.toBeChecked();
      await fullscreen.check();
    }
    await reduced.setChecked(!android);
    await page.getByLabel("Preferred audio").selectOption("ja");
    await page.reload();
    await expect(page.getByLabel("Preferred audio")).toHaveValue("ja");
    if (!android)
      await expect(
        page.getByRole("switch", { name: "Fullscreen on start" }),
      ).toBeChecked();
    await expect(
      page.getByRole("switch", { name: "Reduce animations" }),
    ).toHaveJSProperty("checked", !android);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    if (!android) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await expect(page.locator(".ambient-backdrop")).toHaveCSS(
        "background-color",
        "rgb(45, 51, 59)",
      );
      await expect(page.locator(".ambient-backdrop-layer")).toHaveCount(0);
    }
    await page.screenshot({
      path: test
        .info()
        .outputPath(`settings-${android ? "android" : "desktop"}.png`),
      fullPage: true,
    });
  });

test("web hides settings and library history sections", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.goto("/#/library");
  await expect(
    page.getByRole("heading", { name: "Saved titles" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Continue watching" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Watched", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Settings", exact: true }),
  ).toHaveCount(0);
  await page.goto("/#/settings");
  await expect.poll(() => page.evaluate(() => location.hash)).toBe("#/home");
});

test("startup snapshot is weekly, bundled and clear-cache preserves personal data", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false, true);
  await page.goto("/#/home");
  await expect(
    page.getByRole("heading", { name: "Trending this week" }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const module = await import("/src/lib/startup-artwork.js");
    const db = await new Promise((resolve) => {
      const request = indexedDB.open("rainflix-startup-artwork", 1);
      request.onsuccess = () => resolve(request.result);
    });
    await new Promise((resolve) => {
      const tx = db.transaction("artwork", "readwrite");
      tx.objectStore("artwork").put(
        {
          images: [new Blob(["fixture"], { type: "image/png" })],
          expiresAt: Date.now() + 604800000,
        },
        "weekly",
      );
      tx.oncomplete = resolve;
    });
    let requests = 0;
    const original = window.RainFlixApi.getLoaderPosters;
    window.RainFlixApi.getLoaderPosters = async () => {
      requests++;
      return [];
    };
    await module.refreshStartupArtwork();
    window.RainFlixApi.getLoaderPosters = original;
    const posters = await module.startupPosters();
    posters.forEach((url) => URL.revokeObjectURL(url));
    localStorage.setItem("rainflix:settings:v1", "keep");
    localStorage.setItem("rainflix:tmdb:v1:fixture", "remove");
    await module.clearArtworkCache();
    return {
      requests,
      seeded: module.seedPosters.length,
      cached: posters[0].startsWith("blob:"),
      saved: localStorage.getItem("rainflix:settings:v1"),
      removed: localStorage.getItem("rainflix:tmdb:v1:fixture"),
    };
  });
  expect(result).toEqual({
    requests: 0,
    seeded: 14,
    cached: true,
    saved: "keep",
    removed: null,
  });
});
