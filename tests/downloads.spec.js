import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

const endpoint =
  "https://api.github.com/repos/Kanonsoft/RainFlix/releases/latest";
const installer =
  "https://github.com/Kanonsoft/RainFlix/releases/download/v1.0.0/RainFlix_1.0.0_x64-setup.exe";
const release = {
  tag_name: "v1.0.0",
  assets: [
    {
      name: "RainFlix_1.0.0_x64-setup.exe",
      browser_download_url: installer,
      size: 52428800,
    },
    {
      name: "RainFlix_android.apk",
      browser_download_url:
        "https://github.com/Kanonsoft/RainFlix/releases/download/v1.0.0/app.apk",
    },
  ],
};

for (const width of [320, 390, 1440]) {
  test(`landing opens downloads in a new tab with both installers at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockPlayback({ page, baseURL }, false);
    await page.route("**/trending/movie/week?**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              id: 505,
              title: "Playback Test",
              backdrop_path: "/backdrop.jpg",
              poster_path: "/poster.jpg",
            },
          ],
        },
      }),
    );
    await page.route(endpoint, (route) => route.fulfill({ json: release }));
    await page.goto("/#/home");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("link", { name: "Add-ons", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Downloads", exact: true }),
    ).toHaveCount(width < 1024 ? 0 : 1);
    if (width < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
    }
    const navigation = page.getByRole("navigation", {
      name: width < 1024 ? "Mobile primary navigation" : "Primary navigation",
      exact: true,
    });
    await expect(
      navigation.getByRole("link", { name: "Downloads", exact: true }),
    ).not.toHaveAttribute("target", "_blank");
    await navigation
      .getByRole("link", { name: "Downloads", exact: true })
      .click();
    await expect(page).toHaveURL(/#\/downloads$/);
    await page.goto("/");
    await expect(
      page
        .getByRole("navigation", { name: "RainFlix introduction" })
        .getByRole("link", { name: "Downloads", exact: true }),
    ).toHaveCount(0);
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "Download RainFlix", exact: true })
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/#\/downloads$/);
    await expect(page).not.toHaveURL(/#\/downloads$/);
    await popup.close();
    await page.goto("/#/downloads");
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "background-image",
      /backdrop\.jpg/,
    );
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(page).toHaveURL(/#\/downloads$/);
    await expect(
      page.getByRole("heading", { name: "Downloads", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Download for Windows", exact: true }),
    ).toHaveAttribute("href", installer);
    await expect(
      page
        .getByRole("region", { name: "Windows", exact: true })
        .getByText("v1.0.0", { exact: false }),
    ).toContainText("50.0 MB");
    const android = page.getByRole("region", { name: "Android", exact: true });
    await expect(
      android.getByRole("link", { name: "Download for Android" }),
    ).toHaveAttribute("href", release.assets[1].browser_download_url);
    for (const platform of ["Windows", "Android"]) {
      const logo = page.getByRole("img", { name: `${platform} logo` });
      await expect(logo).toBeVisible();
      await expect
        .poll(() =>
          logo.evaluate((image) => image.complete && image.naturalWidth > 0),
        )
        .toBe(true);
    }
    for (const platform of ["Windows", "Android"]) {
      const region = page.getByRole("region", { name: platform, exact: true });
      const button = region.getByRole("link", {
        name: `Download for ${platform}`,
      });
      if (width >= 768) {
        const rowBox = await region.boundingBox();
        const buttonBox = await button.boundingBox();
        expect(
          Math.abs(
            buttonBox.y + buttonBox.height / 2 - rowBox.y - rowBox.height / 2,
          ),
        ).toBeLessThan(3);
        expect(
          Math.abs(buttonBox.x + buttonBox.width - rowBox.x - rowBox.width),
        ).toBeLessThan(3);
      }
    }
    await page.screenshot({
      path: test.info().outputPath(`downloads-${width}.png`),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 768) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const drawer = page.getByRole("dialog", { name: "Mobile navigation" });
      await expect(
        drawer.getByRole("link", { name: "Add-ons", exact: true }),
      ).toHaveCount(0);
      await expect(
        drawer.getByRole("link", { name: "Downloads", exact: true }),
      ).toBeVisible();
      await expect(
        drawer.getByRole("link", { name: "Downloads", exact: true }),
      ).not.toHaveAttribute("target", "_blank");
      await drawer.getByRole("button", { name: "Close navigation" }).click();
      await expect(drawer).toBeHidden();
    }
    await page.reload();
    await expect(page.locator(".ambient-backdrop-current")).toHaveCSS(
      "background-image",
      /backdrop\.jpg/,
    );
    await expect(
      page.getByRole("link", { name: "Download for Windows", exact: true }),
    ).toBeVisible();
  });
}

test("unpublished and failed release lookups never offer a broken installer", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  let status = 503;
  await page.route(endpoint, (route) => route.fulfill({ status, json: {} }));
  await page.goto("/#/downloads");
  await expect(
    page.getByText("Couldn't check the Windows installer."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "GitHub Releases" })).toHaveCount(
    0,
  );
  status = 404;
  await page
    .getByRole("button", { name: "Retry Windows release lookup" })
    .click();
  await expect(
    page.getByText("Windows installer not published yet."),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Android installer not published yet."),
  ).toBeVisible();
});

test("desktop header has no download entries", async ({ page, baseURL }) => {
  await mockPlayback({ page, baseURL }, false);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isDesktop=true; export const isAndroid=false; export const isNativeApp=true; export const browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.goto("/#/home");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(
    page.getByRole("link", { name: "Download RainFlix" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Mobile navigation" })
      .getByRole("link", { name: "Add-ons", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("dialog", { name: "Mobile navigation" })
      .getByRole("link", { name: "Download", exact: true }),
  ).toHaveCount(0);
});

test("release assets must be trusted platform installers", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.route(endpoint, (route) =>
    route.fulfill({
      json: {
        assets: [
          {
            name: "bad_x64.exe",
            browser_download_url: "https://evil.example/setup.exe",
          },
          {
            name: "wrong_x64.exe",
            browser_download_url:
              "https://github.com/other/project/releases/download/v1/setup.exe",
          },
          { name: "RainFlix_arm64.exe", browser_download_url: installer },
          {
            name: "bad.apk",
            browser_download_url: "https://evil.example/app.apk",
          },
          {
            name: "app-arm64-debug.apk",
            browser_download_url: release.assets[1].browser_download_url,
          },
          release.assets[0],
        ],
      },
    }),
  );
  await page.goto("/#/downloads");
  await expect(
    page.getByRole("link", { name: "Download for Windows" }),
  ).toHaveAttribute("href", installer);
  await expect(
    page.getByRole("link", { name: "Download for Android" }),
  ).toHaveCount(0);
});
