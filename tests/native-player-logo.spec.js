import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  await page.route(`${baseURL}/`, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<html><body></body></html>",
    }),
  );
  await page.goto("/");
});

test("prepares bounded transparent artwork for the native buffering overlay", async ({
  page,
}) => {
  const logo = await page.evaluate(async () => {
    const { prepareNativePlayerLogo } =
      await import("/src/lib/native-torrent.js");
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 288;
    const context = canvas.getContext("2d");
    context.fillStyle = "rgba(255, 0, 0, 0.5)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const result = await prepareNativePlayerLogo(canvas.toDataURL());
    const pixels = atob(result.data);
    return {
      width: result.width,
      height: result.height,
      length: pixels.length,
      red: pixels.charCodeAt(0),
      alpha: pixels.charCodeAt(3),
      saved: localStorage.length,
    };
  });
  expect(logo).toMatchObject({
    width: 384,
    height: 144,
    length: 384 * 144 * 4,
    red: 255,
    saved: 0,
  });
  expect(logo.alpha).toBeGreaterThanOrEqual(127);
  expect(logo.alpha).toBeLessThanOrEqual(128);
});

test("missing, invalid and aborted native artwork falls back without blocking playback", async ({
  page,
}) => {
  const results = await page.evaluate(async () => {
    const { prepareNativePlayerLogo } =
      await import("/src/lib/native-torrent.js");
    const controller = new AbortController();
    controller.abort();
    return [
      await prepareNativePlayerLogo(""),
      await prepareNativePlayerLogo("data:text/plain,not-an-image"),
      await prepareNativePlayerLogo("/never-requested.png", controller.signal),
    ];
  });
  expect(results).toEqual([null, null, null]);
});

test("slow artwork times out independently of media startup", async ({
  page,
  baseURL,
}) => {
  await page.route(`${baseURL}/slow-logo.png`, () => {});
  const result = await page.evaluate(async () => {
    const { prepareNativePlayerLogo } =
      await import("/src/lib/native-torrent.js");
    const start = performance.now();
    const logo = await prepareNativePlayerLogo("/slow-logo.png");
    return { logo, elapsed: performance.now() - start };
  });
  expect(result.logo).toBeNull();
  expect(result.elapsed).toBeLessThan(4000);
});
