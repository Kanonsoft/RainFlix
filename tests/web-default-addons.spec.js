import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer } from "./helpers/playback.js";

test("web has no Yastream preset and promotes RainFlix App before official services", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route("**/scripts/config.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() });
  });
  let yastreamRequests = 0;
  await page.route("https://yastream.tamthai.de/**", (route) => {
    yastreamRequests++;
    return route.fulfill({ json: { streams: [] } });
  });
  await openPlayer(page);
  await expect(
    page.getByRole("button", { name: "Play with Yastream" }),
  ).toHaveCount(0);
  const app = page.getByRole("link", {
    name: "RainFlix App free streams - download the app",
  });
  await expect(app).toBeVisible();
  await expect(app.locator("xpath=../*[1]")).toHaveAttribute(
    "href",
    "#/downloads",
  );
  expect(yastreamRequests).toBe(0);
  const actions = page.getByRole("group", { name: "Title actions" });
  await expect(actions.locator(":scope > :first-child")).toHaveText(
    "Watch on RainFlix App",
  );
  await expect(actions.locator(":scope > :first-child")).toHaveClass(
    /bg-sky-400/,
  );
  await page
    .getByRole("link", { name: "Watch on RainFlix App", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/downloads$/);
});

for (const platform of ["web", "desktop", "android"]) {
  test(`${platform} retires removed presets but preserves manual add-ons`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    const native = platform !== "web";
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export const isNativeApp=${native},isAndroid=${platform === "android"},isDesktop=${platform === "desktop"},browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
      }),
    );
    let preset = true;
    await page.route("**/scripts/config.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.RAINFLIX_CONFIG.nativeDefaultAddons=${native && preset ? '["https://preset.example/manifest.json"]' : "[]"};window.RAINFLIX_CONFIG.webDefaultAddons=${!native && preset ? '["https://preset.example/manifest.json"]' : "[]"};`,
      });
    });
    let requests = 0;
    await page.route("https://preset.example/**", (route) => {
      requests++;
      return route.fulfill({
        json: {
          id: "preset",
          name: "Former preset",
          types: ["movie"],
          resources: ["catalog"],
          catalogs: [],
        },
      });
    });
    await page.route("https://manual.example/**", (route) =>
      route.fulfill({
        json: {
          id: "manual",
          name: "Manual provider",
          types: ["movie"],
          resources: ["stream"],
        },
      }),
    );
    await openPlayer(page);
    await expect.poll(() => requests).toBe(1);
    await page.evaluate(async () => {
      const addons = await import("/src/lib/addons.js");
      await addons.installAddon("https://manual.example/manifest.json");
    });
    preset = false;
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const storage = await import("/src/lib/addon-storage.js");
          return (await storage.addonRegistrations()).map(
            (item) => item.manifestUrl,
          );
        }),
      )
      .toEqual(["https://manual.example/manifest.json"]);
    expect(requests).toBe(1);
    if (native)
      await expect(
        page.getByRole("link", { name: "Watch on RainFlix App", exact: true }),
      ).toHaveCount(0);
  });
}
