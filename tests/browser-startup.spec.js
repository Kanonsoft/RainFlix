import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

const scenarios = [
  { name: "disabled analytics", enabled: false, blocked: "all" },
  { name: "blocked analytics module", enabled: true, blocked: "module" },
  { name: "blocked analytics component", enabled: true, blocked: "component" },
  { name: "blocked analytics script", enabled: true, blocked: "script" },
  { name: "available analytics", enabled: true, blocked: "none" },
];

for (const scenario of scenarios) {
  test(`starts and stays usable with ${scenario.name}`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL });
    const errors = [];
    const analyticsRequests = [];
    const blockedRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.route("**/scripts/config.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nObject.assign(window.RAINFLIX_CONFIG, ${JSON.stringify(
          {
            analyticsScriptUrl: scenario.enabled
              ? `${baseURL}/__metrics__/script.js`
              : "",
            analyticsWebsiteId: scenario.enabled ? "test-site" : "",
          },
        )});`,
      });
    });
    await page.route(
      (url) =>
        /\/(analytics\.js|PrivacyAnalytics\.jsx)$/.test(url.pathname) ||
        url.pathname === "/__metrics__/script.js",
      async (route) => {
        const pathname = new URL(route.request().url()).pathname;
        analyticsRequests.push(pathname);
        const blocked =
          scenario.blocked === "all" ||
          (scenario.blocked === "module" &&
            pathname.endsWith("/analytics.js")) ||
          (scenario.blocked === "component" &&
            pathname.endsWith("/PrivacyAnalytics.jsx")) ||
          (scenario.blocked === "script" &&
            pathname === "/__metrics__/script.js");
        if (blocked) {
          blockedRequests.push(pathname);
          await route.abort("blockedbyclient");
        } else if (pathname === "/__metrics__/script.js") {
          await route.fulfill({
            contentType: "application/javascript",
            body: "window.__testEvents = []; window.umami = { track: (name, data) => window.__testEvents.push({ name, data }) };",
          });
        } else {
          await route.continue();
        }
      },
    );

    await page.goto("/#/home");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(
      page.locator('meta[name="mobile-web-app-capable"]'),
    ).toHaveAttribute("content", "yes");
    await page.getByRole("link", { name: "Movies", exact: true }).click();
    await expect(page).toHaveURL(/#\/movies$/);

    // Use a known title without leaving the SPA, exercising lazy route imports too.
    await page.evaluate(() => {
      window.location.hash = "/search?q=test";
    });
    await expect(
      page.getByRole("heading", { name: "Search RainFlix" }),
    ).toBeVisible();
    await page.locator("#catalogSearch").fill("test again");
    await page.locator("#catalogSearch").press("Enter");
    await expect(page).toHaveURL(/q=test\+again/);

    await page.evaluate(() => {
      window.location.hash = "/home?preview=movie-505";
    });
    const dialog = page.getByRole("region", {
      name: "Title details",
      exact: true,
    });
    await dialog.getByRole("button", { name: "My List", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "In My List", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Play with VidSrc", exact: true })
      .click();
    await expect(page.locator("#playerShell iframe")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close player" }),
    ).toBeVisible();

    if (!scenario.enabled) {
      expect(analyticsRequests).toEqual([]);
    } else if (scenario.blocked === "module") {
      expect(analyticsRequests).not.toContain("/src/lib/analytics.js");
      await expect
        .poll(() =>
          page.evaluate(() => window.__testEvents?.map((event) => event.name)),
        )
        .toContain("my-list-add");
    } else if (scenario.blocked !== "none") {
      expect(blockedRequests.length).toBeGreaterThan(0);
    } else {
      await expect
        .poll(() =>
          page.evaluate(() => window.__testEvents?.map((event) => event.name)),
        )
        .toContain("my-list-add");
    }
    expect(errors).toEqual([]);
  });
}
