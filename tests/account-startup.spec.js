import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const outcome of ["complete", "failure", "timeout"]) {
  test(`native startup loader waits for account sync and releases on ${outcome}`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false, true);
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const isNativeApp=true,isDesktop=true,isAndroid=false,browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
      }),
    );
    await page.route("**/src/lib/account-sync.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export async function initializeAccountSync(options) { window.startupOptions=options; await new Promise((resolve,reject)=>{window.finishStartup=resolve;window.failStartup=reject;}); }`,
      }),
    );
    await page.clock.install();
    await page.goto("/#/home");
    await expect
      .poll(() => page.evaluate(() => window.startupOptions?.waitForStartup))
      .toBe(true);
    await page.clock.runFor(4500);
    await expect(page.locator("#appLoader")).not.toHaveClass(/is-hidden/);
    await expect(page.locator("#app-shell")).toHaveAttribute("inert", "");
    if (outcome === "timeout") await page.clock.runFor(31000);
    else {
      await page.evaluate((outcome) => {
        if (outcome === "failure") window.failStartup(new Error("offline"));
        else window.finishStartup();
      }, outcome);
      await page.clock.runFor(4000);
    }
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/);
    await expect(page.locator("#app-shell")).not.toHaveAttribute("inert", "");
  });
}
