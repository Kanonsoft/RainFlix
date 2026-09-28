import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("the built app and lazy title routes load under the GitHub Pages subfolder", async ({
  page,
  baseURL,
  request,
}) => {
  await mockPlayback({ page, baseURL }, false);
  const errors = [];
  const failedAssets = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.url().startsWith(baseURL) && response.status() >= 400)
      failedAssets.push(response.url());
  });
  const response = await request.get(baseURL);
  const html = await response.text();
  expect(response.ok()).toBe(true);
  expect(html).not.toContain("/src/main.jsx");
  expect(html).toMatch(/\/RainFlix\/assets\/index-[^" ]+\.js/);
  await page.goto(`${baseURL}#/home`);
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(page.locator("#startupFallback")).toHaveCount(0);
  await page.getByRole("link", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL(/\/RainFlix\/#\/movies$/);
  await page.evaluate(() => {
    window.location.hash = "/title/movie/505";
  });
  await expect(
    page.getByRole("heading", { name: "Playback Test", level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Play with VidSrc", exact: true })
    .click();
  await expect(page.locator("#playerShell iframe")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Playback Test", level: 1 }),
  ).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
  expect(failedAssets).toEqual([]);
});

test("an unavailable entry bundle shows recovery instead of a blank screen", async ({
  page,
  baseURL,
}) => {
  await page.route("**/assets/index-*.js", (route) => route.abort("failed"));
  await page.goto(baseURL);
  const fallback = page.locator("#startupFallback");
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText("RainFlix could not start", {
    timeout: 15000,
  });
  await expect(
    fallback.getByRole("button", { name: "Reload", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator("body")
      .evaluate((node) => getComputedStyle(node).backgroundColor),
  ).toBe("rgb(3, 7, 18)");
});
