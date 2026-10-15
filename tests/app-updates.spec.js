import { test, expect } from "@playwright/test";
import { newerRelease } from "../src/lib/downloads.js";
import { mockPlayback } from "./helpers/playback.js";

test("update versions compare numerically and reject prerelease or invalid tags", () => {
  expect(newerRelease("v1.10.0", "1.9.0")).toBe(true);
  expect(newerRelease("android-v2.0.1", "2.0.0")).toBe(true);
  expect(newerRelease("v1.0.0", "1.0.0")).toBe(false);
  expect(newerRelease("v0.9.0", "1.0.0")).toBe(false);
  expect(newerRelease("v2.0.0-beta", "1.0.0")).toBe(false);
  expect(newerRelease("not-a-version", "1.0.0")).toBe(false);
});

for (const android of [false, true])
  test(`native update notice selects ${android ? "APK" : "EXE"}, snoozes and remains in Settings`, async ({
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
    await page.setViewportSize({ width: android ? 390 : 1440, height: 900 });
    const release = {
      tag_name: "v2.1.0",
      assets: [
        {
          name: "RainFlix_x64-setup.exe",
          browser_download_url:
            "https://github.com/Kanonsoft/RainFlix/releases/download/v2.1.0/RainFlix.exe",
        },
        {
          name: "app-arm64-release.apk",
          browser_download_url:
            "https://github.com/Kanonsoft/RainFlix/releases/download/v2.1.0/RainFlix.apk",
        },
      ],
    };
    let requestCount = 0;
    await page.route(
      "https://api.github.com/repos/**/releases/latest",
      (route) => {
        requestCount++;
        return route.fulfill({ json: release });
      },
    );
    await page.goto("/#/settings/updates");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    const notice = page.getByRole("complementary", {
      name: "App update available",
    });
    await expect(notice).toBeVisible();
    await expect(
      notice.getByRole("link", { name: "Download update" }),
    ).toHaveAttribute("href", new RegExp(android ? "\\.apk$" : "\\.exe$"));
    await notice.getByRole("button", { name: "Remind me tomorrow" }).click();
    await expect(notice).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Download v2.1.0" }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await expect(
      page.getByRole("link", { name: "Download v2.1.0" }),
    ).toBeVisible();
    await expect(notice).toHaveCount(0);
    expect(requestCount).toBeGreaterThanOrEqual(2);
    release.tag_name = "v2.2.0";
    await page
      .getByRole("button", { name: "Check for updates", exact: true })
      .click();
    await expect(notice).toBeVisible();
  });

test("web has no native update checker or notification", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  let requests = 0;
  await page.route(
    "https://api.github.com/repos/**/releases/latest",
    (route) => {
      requests++;
      return route.fulfill({ status: 500, json: {} });
    },
  );
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  expect(requests).toBe(0);
  await expect(
    page.getByRole("complementary", { name: "App update available" }),
  ).toHaveCount(0);
});

test("native checks automatically once at startup without a five-second polling loop", async ({
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
  let calls = 0;
  await page.route(
    "https://api.github.com/repos/**/releases/latest",
    (route) => {
      calls++;
      return route.fulfill({
        json: {
          tag_name: "v2.1.0",
          assets: [
            {
              name: "RainFlix_x64.exe",
              browser_download_url:
                "https://github.com/Kanonsoft/RainFlix/releases/download/v2.1.0/RainFlix.exe",
            },
          ],
        },
      });
    },
  );
  await page.clock.install();
  await page.goto("/#/settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await page.clock.runFor(6000);
  await expect(
    page.getByRole("complementary", { name: "App update available" }),
  ).toBeVisible();
  expect(calls).toBe(1);
  await page.clock.runFor(60000);
  expect(calls).toBe(1);
});
