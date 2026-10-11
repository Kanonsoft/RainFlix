import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mockPlayback } from "./helpers/playback.js";

test("add-on artwork persists across reloads without storing its URL or credentials", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  let requests = 0;
  const url = "https://logos.example/logo.png?private=not-stored";
  await page.route(url, async (route) => {
    requests++;
    await route.fulfill({
      contentType: "image/png",
      path: resolve("assets/rainflix-r.png"),
    });
  });
  await page.goto("/#/home");
  const read = () =>
    page.evaluate(async (url) => {
      const { cachedAddonLogo } = await import("/src/lib/addon-logos.js");
      return cachedAddonLogo(url);
    }, url);
  expect(await read()).toMatch(/^data:image\/png;base64,/);
  expect(await read()).toMatch(/^data:image\/png;base64,/);
  await page.reload();
  expect(await read()).toMatch(/^data:image\/png;base64,/);
  expect(requests).toBe(1);
  const stored = await page.evaluate(async () => {
    const db = await new Promise((resolve) => {
      const r = indexedDB.open("rainflix-addon-artwork", 1);
      r.onsuccess = () => resolve(r.result);
    });
    return new Promise((resolve) => {
      const r = db.transaction("logos").objectStore("logos").getAll();
      r.onsuccess = () => resolve(JSON.stringify(r.result));
    });
  });
  expect(stored).not.toContain("private");
  expect(stored).not.toContain("logos.example");
  await page.evaluate(async () => {
    const m = await import("/src/lib/addon-logos.js");
    await m.clearAddonLogoCache();
  });
  expect(await read()).toMatch(/^data:image\/png;base64,/);
  expect(requests).toBe(2);
});
