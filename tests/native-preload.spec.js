import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

async function setup({ page, baseURL }, future = false) {
  await mockPlayback({ page, baseURL });
  if (future)
    await page.route(
      "https://api.themoviedb.org/3/tv/505/season/1?*",
      (route) =>
        route.fulfill({
          json: {
            season_number: 1,
            episodes: [
              { episode_number: 1, name: "First" },
              {
                episode_number: 2,
                name: "Not yet released",
                air_date: "2999-01-01",
              },
            ],
          },
        }),
    );
  await page.route("**/src/platform/index.js", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "export const isDesktop=true; export const isAndroid=false; export const isNativeApp=true; export const browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
    }),
  );
  await page.addInitScript(() => {
    const callbacks = new Map();
    let callbackId = 0;
    let listener;
    window.nativeCalls = [];
    window.nativeEmit = (payload) => callbacks.get(listener)?.({ payload });
    window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} };
    window.__TAURI_INTERNALS__ = {
      transformCallback(callback) {
        callbacks.set(++callbackId, callback);
        return callbackId;
      },
      async invoke(command, args) {
        window.nativeCalls.push({ command, args });
        if (command === "plugin:event|listen") {
          listener = args.handler;
          return 1;
        }
        if (command === "start_native_torrent") {
          setTimeout(() => {
            window.nativeEmit({ sessionId: args.sessionId, kind: "opened" });
            window.nativeEmit({ sessionId: args.sessionId, kind: "playing" });
          }, 30);
          return {
            sessionId: args.sessionId,
            url: "http://127.0.0.1:12345/media/test",
          };
        }
        if (command === "control_native_preload") return true;
      },
    };
  });
  await page.route("https://torrentio.strem.fun/**", (route) => {
    const next =
      route.request().url().includes("%3A1%3A2") ||
      route.request().url().includes(":1:2");
    return route.fulfill({
      json: {
        streams: (next ? ["720p", "1080p"] : ["1080p"]).map((quality) => ({
          name: `Torrentio ${quality}`,
          title: `Episode ${next ? 2 : 1} WEB-DL x265`,
          infoHash: (next ? (quality === "1080p" ? "b" : "c") : "a").repeat(40),
          fileIdx: next ? 4 : 2,
          sources: ["tracker:udp://tracker.example:80/announce"],
        })),
      },
    });
  });
  await openPlayer(page, "tv");
  await selectPlayer(page, "torrentio");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.nativeCalls.some(
          (call) => call.command === "start_native_torrent",
        ),
      ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(1);
}

async function emit(page, mode, kind = "episode") {
  await page.evaluate(
    ({ mode, kind }) => {
      const session = window.nativeCalls.findLast(
        (call) => call.command === "start_native_torrent",
      );
      window.nativeEmit({
        sessionId: session.args.sessionId,
        kind,
        mode,
        videoId: "tt0505000:1:2",
      });
    },
    { mode, kind },
  );
}

for (const action of ["next", "complete"]) {
  test(`desktop ${action} without a preload still uses matching provider quality`, async ({
    page,
    baseURL,
  }) => {
    await setup({ page, baseURL });
    await emit(page, "next", action === "complete" ? "complete" : "episode");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeCalls.filter(
              (call) => call.command === "start_native_torrent",
            ).length,
        ),
      )
      .toBe(2);
    const started = await page.evaluate(
      () =>
        window.nativeCalls.findLast(
          (call) => call.command === "start_native_torrent",
        ).args,
    );
    expect(started.infoHash).toBe("b".repeat(40));
    expect(started.fileIdx).toBe(4);
    expect(started.preloadId).toBeNull();
  });

  test(`desktop preloading reuses the same-provider torrent on ${action}`, async ({
    page,
    baseURL,
  }) => {
    await setup({ page, baseURL });
    expect(
      await page.evaluate(() =>
        window.nativeCalls.some(
          (call) => call.command === "preload_native_torrent",
        ),
      ),
    ).toBe(false);
    await emit(page, "preload");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.nativeCalls.some(
            (call) => call.command === "preload_native_torrent",
          ),
        ),
      )
      .toBe(true);
    await page.waitForTimeout(100);
    const preload = await page.evaluate(
      () =>
        window.nativeCalls.find(
          (call) => call.command === "preload_native_torrent",
        ).args,
    );
    expect(preload.fileIdx).toBe(4);
    expect(preload.sources).toContain(
      "tracker:udp://tracker.example:80/announce",
    );
    expect(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          )[0].episode,
      ),
    ).toBe(1);
    await page.evaluate(() => {
      const session = window.nativeCalls.findLast(
        (call) => call.command === "start_native_torrent",
      ).args.sessionId;
      window.nativeEmit({
        sessionId: session,
        kind: "preferences",
        tracks: { sub: { lang: "eng" }, audio: { lang: "jpn" }, speed: 1.25 },
      });
    });
    await emit(page, "next", action === "complete" ? "complete" : "episode");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeCalls.filter(
              (call) => call.command === "start_native_torrent",
            ).length,
        ),
      )
      .toBe(2);
    const started = await page.evaluate(
      () =>
        window.nativeCalls.findLast(
          (call) => call.command === "start_native_torrent",
        ).args,
    );
    expect(started.preloadId).toBe(preload.preloadId);
    expect(started.infoHash).toBe("b".repeat(40));
    expect(started.fileIdx).toBe(4);
    expect(started.ui.title).toContain("S1 E2");
    expect(started.ui.tracks).toMatchObject({
      sub: { lang: "eng" },
      audio: { lang: "jpn" },
      speed: 1.25,
    });
    const storage = await page.evaluate(() => JSON.stringify(localStorage));
    expect(storage).not.toContain(preload.preloadId);
    expect(storage).not.toContain("b".repeat(40));
  });
}

test("Next reuses an initialized preload before warming finishes", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== "preload_native_torrent") return invoke(command, args);
      window.nativeCalls.push({ command, args });
      window.nativeEmit({
        sessionId: args.sessionId,
        kind: "preload-status",
        preloadId: args.preloadId,
        status: "buffering",
        percent: 25,
      });
      return new Promise((resolve) => {
        window.finishPreload = resolve;
      });
    };
  });
  await emit(page, "preload");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.nativeCalls.some(
          (call) =>
            call.command === "update_native_preload_status" &&
            call.args.status === "buffering" &&
            call.args.percent === 25,
        ),
      ),
    )
    .toBe(true);
  const preload = await page.evaluate(
    () =>
      window.nativeCalls.find(
        (call) => call.command === "preload_native_torrent",
      ).args,
  );
  await emit(page, "next");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nativeCalls.filter(
            (call) => call.command === "start_native_torrent",
          ).length,
      ),
    )
    .toBe(2);
  const started = await page.evaluate(
    () =>
      window.nativeCalls.findLast(
        (call) => call.command === "start_native_torrent",
      ).args,
  );
  expect(started.preloadId).toBe(preload.preloadId);
  expect(started.fileIdx).toBe(4);
  expect(started.infoHash).toBe("b".repeat(40));
  await page.evaluate(() => window.finishPreload());
  await page.waitForTimeout(100);
  expect(
    await page.evaluate(
      (id) =>
        window.nativeCalls.some(
          (call) =>
            call.command === "control_native_preload" &&
            call.args.preloadId === id &&
            !call.args.claim,
        ),
      preload.preloadId,
    ),
  ).toBe(false);
});

test("a failed preload reports failure instead of claiming readiness", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command !== "preload_native_torrent") return invoke(command, args);
      window.nativeCalls.push({ command, args });
      throw new Error("No peers supplied metadata");
    };
  });
  await emit(page, "preload");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.nativeCalls.some(
          (call) =>
            call.command === "update_native_preload_status" &&
            call.args.status === "failed",
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() =>
      window.nativeCalls.some(
        (call) =>
          call.command === "update_native_preload_status" &&
          call.args.status === "ready",
      ),
    ),
  ).toBe(false);
});

test("repeated Next and EOF during a preload claim advance only once", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  await emit(page, "preload");
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.nativeCalls.some(
          (call) =>
            call.command === "update_native_preload_status" &&
            call.args.status === "ready",
        ),
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async (command, args) => {
      if (command === "control_native_preload" && args.claim)
        await new Promise((resolve) => setTimeout(resolve, 150));
      return invoke(command, args);
    };
    const session = window.nativeCalls.findLast(
      (call) => call.command === "start_native_torrent",
    ).args.sessionId;
    const payload = {
      sessionId: session,
      kind: "episode",
      mode: "next",
      videoId: "tt0505000:1:2",
    };
    window.nativeEmit(payload);
    window.nativeEmit(payload);
    window.nativeEmit({ sessionId: session, kind: "complete" });
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.nativeCalls.filter(
            (call) => call.command === "start_native_torrent",
          ).length,
      ),
    )
    .toBe(2);
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.nativeCalls);
  expect(
    calls.filter(
      (call) => call.command === "control_native_preload" && call.args.claim,
    ),
  ).toHaveLength(1);
  expect(
    calls.filter((call) => call.command === "start_native_torrent"),
  ).toHaveLength(2);
  expect(
    calls.findLast((call) => call.command === "start_native_torrent").args
      .preloadId,
  ).toBeTruthy();
});

test("native decoder errors stop the player and expose retry", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  await emit(page, undefined, "error");
  await expect(
    page.getByRole("button", { name: "Retry", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.nativeCalls.some(
          (call) => call.command === "stop_native_torrent",
        ),
      ),
    )
    .toBe(true);
});

test("desktop preloading cancels on rebuffering and manual episode selection", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL });
  for (const mode of ["cancel-preload", "choose"]) {
    await emit(page, "preload");
    await page.waitForTimeout(150);
    await emit(page, mode);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeCalls.filter(
              (call) =>
                call.command === "control_native_preload" && !call.args.claim,
            ).length,
        ),
      )
      .toBe(mode === "choose" ? 2 : 1);
  }
  expect(
    await page.evaluate(
      () =>
        window.nativeCalls.filter(
          (call) => call.command === "start_native_torrent",
        ).length,
    ),
  ).toBe(1);
});

test("desktop preloading does not download an unreleased episode", async ({
  page,
  baseURL,
}) => {
  await setup({ page, baseURL }, true);
  await emit(page, "preload");
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() =>
      window.nativeCalls.some(
        (call) => call.command === "preload_native_torrent",
      ),
    ),
  ).toBe(false);
});
