import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("desktop imports cold-launch and running-app links through the native bridge", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isDesktop=true; export const isAndroid=false; export const isNativeApp=true; export const browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.addInitScript(() => {
    window.isTauri = true;
    const callbacks = new Map();
    let id = 0;
    let handler;
    let pending = "stremio://cold-addon.example/options/manifest.json";
    window.sendAddonLink = (link) => {
      pending = link;
      callbacks.get(handler)?.({ payload: null });
    };
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        callbacks.set(++id, callback);
        return id;
      },
      async invoke(command, args) {
        if (command === "plugin:event|listen") {
          handler = args.handler;
          return 1;
        }
        if (command === "take_addon_install_link") {
          const result = pending;
          pending = null;
          return result;
        }
      },
    };
  });
  await page.goto("/#/home");
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://cold-addon.example/options/manifest.json",
  );
  await page.evaluate(() =>
    window.sendAddonLink("stremio://warm-addon.example/manifest.json"),
  );
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://warm-addon.example/manifest.json",
  );
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "stremio://inside-addon.example/settings/manifest.json";
    link.textContent = "Install internal add-on";
    document.body.append(link);
    link.click();
    link.remove();
  });
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://inside-addon.example/settings/manifest.json",
  );
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "rainflix://inside-addon.example/configure";
    document.body.append(link);
    link.click();
    link.remove();
  });
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://inside-addon.example/settings/manifest.json",
  );
});

test("website install links support arbitrary providers without automatic requests or credential routes", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  const requests = [];
  await page.route("https://custom-addon.example/**", (route) => {
    requests.push(route.request().url());
    return route.fulfill({
      json: {
        id: "custom.addon",
        name: "Custom Add-on",
        types: ["movie"],
        resources: ["stream"],
      },
    });
  });
  await page.goto("/#/home");
  await page.evaluate(async () => {
    const { receiveAddonInstallLink } =
      await import("/src/lib/addon-install-links.js");
    receiveAddonInstallLink(
      "stremio://custom-addon.example/token=private/manifest.json",
    );
  });
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://custom-addon.example/token=private/manifest.json",
  );
  expect(page.url()).toContain("#/addons");
  expect(page.url()).not.toContain("private");
  expect(requests).toHaveLength(0);
  await page
    .locator("form")
    .getByRole("button", { name: "Install", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Custom Add-on installed" }),
  ).toContainText("Custom Add-on installed.");
  expect(requests).toHaveLength(1);
  await page.evaluate(async () => {
    const { receiveAddonInstallLink } =
      await import("/src/lib/addon-install-links.js");
    receiveAddonInstallLink(
      "rainflix://another-addon.example/settings/manifest.json",
    );
  });
  await expect(page.getByLabel("Manifest URL")).toHaveValue(
    "https://another-addon.example/settings/manifest.json",
  );
});

test("rejects non-manifest, executable and credential-bearing install links", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.goto("/#/addons");
  const results = await page.evaluate(async () => {
    const { addonInstallAddress } =
      await import("/src/lib/addon-install-links.js");
    return [
      "javascript:alert(1)",
      "file:///manifest.json",
      "stremio://user:password@example.com/manifest.json",
      "stremio://example.com/configure",
      "rainflix://example.com/manifest.json#secret",
      "stremio://example.com/manifest.json?key=abc",
    ].map(addonInstallAddress);
  });
  expect(results).toEqual([
    null,
    null,
    null,
    null,
    null,
    "https://example.com/manifest.json?key=abc",
  ]);
});
