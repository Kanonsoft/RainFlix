import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  history,
  selectPlayer,
  selectStream,
  closePlayer,
} from "./helpers/playback.js";

const hash = "0123456789abcdef0123456789abcdef01234567";
const service = "http://127.0.0.1:11470";
const video = (page) =>
  page.getByLabel("Playback Test Torrentio player", { exact: true });
const useStremio = (page) =>
  page
    .getByRole("combobox", { name: "Torrent playback", exact: true })
    .selectOption("stremio");

test.beforeEach(async ({ page, baseURL }) => {
  await mockPlayback({ page, baseURL });
  await page.route("https://torrentio.strem.fun/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "Torrentio sample with a long descriptive release title for checking mobile layout",
            infoHash: hash,
            fileIdx: 0,
            sources: [
              "tracker:udp://tracker.example:80/announce",
              `dht:${hash}`,
            ],
          },
          { name: "Largest file", infoHash: hash },
        ],
      },
    }),
  );
});

test("checks the service without starting a torrent and plays only after Play", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen unavailable"));
  });
  const requests = [];
  await page.route(`${service}/**`, (route) => {
    requests.push(route.request().url());
    return route.request().url().endsWith("/settings")
      ? route.fulfill({ json: { values: { serverVersion: "4.21.0" } } })
      : route.fulfill({
          path: "tests/fixtures/player-sample.mp4",
          contentType: "video/mp4",
        });
  });
  await openPlayer(page);
  await selectPlayer(page, "torrentio");
  await useStremio(page);
  const play = page.locator('button[data-stream-id="0"]');
  await expect(play).toBeVisible();
  expect(requests).toHaveLength(0);
  await expect(page.getByLabel("Service address")).toHaveValue(service);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connected (v4.21.0)")).toBeVisible();
  expect(requests).toEqual([`${service}/settings`]);
  expect(await history(page)).toHaveLength(0);
  await play.click();
  await expect
    .poll(() => video(page).evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  await expect.poll(() => history(page)).toHaveLength(1);
  const mediaUrl = new URL(requests.find((url) => !url.endsWith("/settings")));
  expect(mediaUrl.pathname).toBe(`/${hash}/0`);
  expect(mediaUrl.searchParams.getAll("tr")).toEqual([
    "tracker:udp://tracker.example:80/announce",
    `dht:${hash}`,
  ]);
  await video(page).evaluate((element) => element.pause());
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    )
    .toBeLessThanOrEqual(1);
  await page.locator("#playerShell").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("stremio-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator("#playerShell").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("stremio-desktop.png") });
  await closePlayer(page);
  const count = requests.length;
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connected (v4.21.0)")).toBeVisible();
  expect(requests.slice(count)).toEqual([`${service}/settings`]);
  await expect(video(page)).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Torrent playback", exact: true })
    .selectOption("external");
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Open torrent" }).first(),
  ).toBeVisible();
});

test("preserves server paths and missing file indices and remembers the address", async ({
  page,
}) => {
  const requests = [];
  await page.route("http://localhost:11470/proxy/**", (route) => {
    requests.push(route.request().url());
    return route.request().url().endsWith("/settings")
      ? route.fulfill({ json: { values: { serverVersion: "4.21.0" } } })
      : route.fulfill({
          path: "tests/fixtures/player-sample.mp4",
          contentType: "video/mp4",
        });
  });
  await openPlayer(page);
  await selectPlayer(page, "torrentio");
  await useStremio(page);
  await page
    .getByLabel("Service address")
    .fill("http://localhost:11470/proxy/");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText("Connected (v4.21.0)")).toBeVisible();
  expect(requests).toEqual(["http://localhost:11470/proxy/settings"]);
  await selectStream(page, "1");
  await expect
    .poll(() => video(page).evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
  expect(requests).toContain(`http://localhost:11470/proxy/${hash}/-1`);
  const remembered = await page.evaluate(async () =>
    (await import("/src/lib/stremio-service.js")).readServiceConnection(),
  );
  expect(remembered).toEqual({
    enabled: true,
    baseUrl: "http://localhost:11470/proxy",
  });
  await selectPlayer(page, "vidsrc");
  await expect(page.locator("#playerShell video")).toHaveCount(0);
  await selectPlayer(page, "torrentio");
  await expect(page.getByLabel("Service address")).toHaveValue(
    "http://localhost:11470/proxy",
  );
  await expect(page.locator('button[data-stream-id="0"]')).toBeVisible();
});

test("allows native playback when the service API check is blocked", async ({
  page,
}) => {
  await page.route(`${service}/**`, (route) =>
    route.request().url().endsWith("/settings")
      ? route.abort("failed")
      : route.fulfill({
          path: "tests/fixtures/player-sample.mp4",
          contentType: "video/mp4",
        }),
  );
  await openPlayer(page);
  await selectPlayer(page, "torrentio");
  await useStremio(page);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/The API check can be blocked/)).toBeVisible();
  expect(await history(page)).toHaveLength(0);
  await selectStream(page, "0");
  await expect
    .poll(() => video(page).evaluate((element) => element.currentTime))
    .toBeGreaterThan(0);
});

test("reports offline, invalid and timed-out service checks and playback failures", async ({
  page,
}) => {
  let response = { json: {} };
  let delayed = false;
  await page.route(`${service}/**`, async (route) => {
    if (!route.request().url().endsWith("/settings"))
      return route.abort("failed");
    if (delayed) await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill(response);
  });
  await openPlayer(page);
  await page.evaluate(() => {
    window.RAINFLIX_CONFIG.stremioService.playbackTimeoutMs = 100;
  });
  await selectPlayer(page, "torrentio");
  await useStremio(page);
  const connect = page.getByRole("button", { name: "Connect", exact: true });
  await connect.click();
  await expect(
    page.getByText("This address did not return Stremio Service settings."),
  ).toBeVisible();
  response = { status: 503 };
  await connect.click();
  await expect(
    page.getByText("Stremio Service request failed (503). Try again."),
  ).toBeVisible();
  delayed = true;
  await page.evaluate(() => {
    window.RAINFLIX_CONFIG.stremioService.checkTimeoutMs = 100;
  });
  await connect.click();
  await expect(
    page.getByText("Stremio Service took too long to respond. Try again."),
  ).toBeVisible();
  await selectStream(page, "0");
  await expect(
    page.getByText(/Stremio could not play this torrent/),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open torrent" })).toBeVisible();
  expect(await history(page)).toHaveLength(0);
  await expect(
    page.getByRole("region", { name: "Torrentio player", exact: true }),
  ).toBeVisible();
});

test("cancels stale connection checks and rejects unsupported addresses", async ({
  page,
}) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`${service}/settings`, async (route) => {
    await pending;
    await route.fulfill({ json: { values: { serverVersion: "old" } } });
  });
  await page.route("https://service.example/settings", (route) =>
    route.fulfill({ json: { values: { serverVersion: "new" } } }),
  );
  await openPlayer(page);
  await selectPlayer(page, "torrentio");
  await useStremio(page);
  const connect = page.getByRole("button", { name: "Connect", exact: true });
  await connect.click();
  await expect(page.getByText("Checking service")).toBeVisible();
  await page.getByLabel("Service address").fill("https://service.example");
  await connect.click();
  await expect(page.getByText("Connected (vnew)")).toBeVisible();
  release();
  await page
    .getByLabel("Service address")
    .fill("https://user:password@service.example");
  await connect.click();
  await expect(page.getByRole("alert")).toContainText("without credentials");
  const results = await page.evaluate(async () => {
    const { normalizeServiceUrl } = await import("/src/lib/stremio-service.js");
    return [
      "http://127.0.0.1:11470/",
      "http://localhost:11470",
      "http://[::1]:11470",
      "https://service.example/path/",
      "http://192.168.1.2:11470",
      "ftp://localhost",
      "http://localhost/?key=secret",
      "http://localhost/#fragment",
    ].map((address) => {
      try {
        return normalizeServiceUrl(address, "https:");
      } catch {
        return "invalid";
      }
    });
  });
  expect(results).toEqual([
    "http://127.0.0.1:11470",
    "http://localhost:11470",
    "http://[::1]:11470",
    "https://service.example/path",
    "invalid",
    "invalid",
    "invalid",
    "invalid",
  ]);
  await expect(page.getByText("Connected (vold)")).toHaveCount(0);
});
