import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("native defaults install once, deduplicate and respect removal", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isNativeApp=true,isAndroid=false,isDesktop=true,browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.route("**/scripts/config.js", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.RAINFLIX_CONFIG.webDefaultAddons=[];window.RAINFLIX_CONFIG.nativeDefaultAddons=['https://preset.example/manifest.json','https://preset.example/manifest.json'];`,
    });
  });
  let calls = 0;
  await page.route("https://preset.example/manifest.json", (route) => {
    calls++;
    return route.fulfill({
      json: {
        id: "preset",
        name: "Preset",
        description: "Preset details",
        types: ["movie"],
        resources: ["stream"],
      },
    });
  });
  await page.goto("/#/addons");
  await page.getByRole("tab", { name: "Installed (1)" }).click();
  await expect(page.getByText("Preset details")).toBeVisible();
  expect(calls).toBe(1);
  await page.getByRole("button", { name: "Remove Preset" }).click();
  await expect(page.getByRole("tab", { name: "Installed (0)" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await import("/src/lib/addon-storage.js"))
          .addonRegistrations()
          .then((items) => items.length),
      ),
    )
    .toBe(0);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await import("/src/lib/addon-storage.js")).addonRegistrations(
          undefined,
          "native-default-addons",
        ),
      ),
    )
    .toEqual(["https://preset.example/manifest.json"]);
  await expect(page.getByRole("tab", { name: "Installed (0)" })).toBeVisible();
  expect(calls).toBe(1);
});
