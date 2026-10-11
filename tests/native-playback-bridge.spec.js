import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer, selectPlayer } from "./helpers/playback.js";

for (const mediaType of ["movie", "tv"]) {
  test(`desktop ${mediaType} sources and subtitles use the native player bridge`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL });
    let releaseSeason;
    const seasonReady = new Promise((resolve) => {
      releaseSeason = resolve;
    });
    if (mediaType === "tv") {
      await page.route("https://api.themoviedb.org/3/tv/505?*", (route) =>
        route.fulfill({
          json: {
            id: 505,
            name: "Playback Test",
            external_ids: { imdb_id: "tt0505000" },
            seasons: [
              { season_number: 1, episode_count: 2 },
              { season_number: 23, episode_count: 2 },
            ],
          },
        }),
      );
      await page.route(
        "https://api.themoviedb.org/3/tv/505/season/23?*",
        async (route) => {
          await seasonReady;
          await route.fulfill({
            json: {
              season_number: 23,
              episodes: [
                { episode_number: 1123, name: "Late season first" },
                { episode_number: 1124, name: "Late season next" },
              ],
            },
          });
        },
      );
    }
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
          if (command === "start_native_media") {
            setTimeout(() => {
              window.nativeEmit({ sessionId: args.sessionId, kind: "opened" });
              window.nativeEmit({ sessionId: args.sessionId, kind: "playing" });
            }, 50);
            return { sessionId: args.sessionId, url: args.url };
          }
        },
      };
      sessionStorage.setItem(
        "rainflix:addons:session:v1",
        JSON.stringify([
          {
            id: "addon:subs",
            enabled: true,
            manifestUrl: "https://subs.example/manifest.json",
            manifest: {
              id: "test.subs",
              name: "Community Subs",
              types: ["movie", "series"],
              resources: ["subtitles"],
            },
          },
        ]),
      );
    });
    await page.route("https://subs.example/**", (route) =>
      route.fulfill({
        json: {
          subtitles: [
            { lang: "eng", url: `${baseURL}/__media__/captions.srt` },
          ],
        },
      }),
    );
    await page.route("https://yastream.tamthai.de/**", (route) =>
      route.fulfill({
        json: route.request().url().includes("/stream/")
          ? {
              streams: [
                {
                  name: "HTTP video",
                  url: `${baseURL}/__media__/player-sample.mp4`,
                },
              ],
            }
          : { subtitles: [] },
      }),
    );
    await openPlayer(page, mediaType);
    await selectPlayer(page, "yastream");
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.nativeCalls.some(
            (call) => call.command === "start_native_media",
          ),
        ),
      )
      .toBe(true);
    await expect(page.locator("#playerShell video")).toHaveCount(0);
    if (mediaType === "tv") {
      const title = await page.evaluate(
        () =>
          window.nativeCalls.find(
            (call) => call.command === "start_native_media",
          ).args.ui.title,
      );
      expect(title).toContain("S1 E1");
      await page.evaluate(() => {
        const session = window.nativeCalls.find(
          (call) => call.command === "start_native_media",
        );
        window.nativeEmit({
          sessionId: session.args.sessionId,
          kind: "episode",
          mode: "season",
          videoId: "23",
        });
      });
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.nativeCalls.some(
              (call) =>
                call.command === "update_native_player_episodes" &&
                call.args.season === 23 &&
                call.args.status === "loading",
            ),
          ),
        )
        .toBe(true);
      releaseSeason();
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.nativeCalls.some(
              (call) =>
                call.command === "update_native_player_episodes" &&
                call.args.season === 23 &&
                call.args.status === "ready" &&
                call.args.episodes.some(
                  (item) => item.season === 23 && item.episode === 1,
                ),
            ),
          ),
        )
        .toBe(true);
    }
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeCalls.findLast(
              (call) => call.command === "update_native_player_subtitles",
            )?.args.subtitles.length || 0,
        ),
      )
      .toBe(1);
    const before = await page.evaluate(() =>
      window.nativeCalls.filter(
        (call) => call.command === "load_native_subtitle",
      ),
    );
    expect(before).toHaveLength(0);
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
    await page.evaluate(() => {
      const session = window.nativeCalls.find(
        (call) => call.command === "start_native_media",
      );
      const options = window.nativeCalls.findLast(
        (call) => call.command === "update_native_player_subtitles",
      );
      window.nativeEmit({
        sessionId: session.args.sessionId,
        kind: "subtitle",
        subtitleId: options.args.subtitles[0].id,
      });
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            window.nativeCalls.filter(
              (call) => call.command === "load_native_subtitle",
            ).length,
        ),
      )
      .toBe(1);
    const calls = await page.evaluate(() => window.nativeCalls);
    expect(
      calls.findLast((call) => call.command === "load_native_subtitle").args
        .url,
    ).toContain("captions.srt");
    expect(
      JSON.stringify(
        calls.findLast(
          (call) => call.command === "update_native_player_subtitles",
        ).args,
      ),
    ).not.toContain("captions.srt");
    await page.evaluate((mediaType) => {
      const session = window.nativeCalls.find(
        (call) => call.command === "start_native_media",
      );
      window.nativeEmit({
        sessionId: session.args.sessionId,
        kind: "progress",
        position: mediaType === "tv" ? 2430 : 950,
        duration: mediaType === "tv" ? 2700 : 1000,
      });
    }, mediaType);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rainflix:watched:v1") || "[]")
              .length,
        ),
      )
      .toBe(1);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(
              localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
            ).length,
        ),
      )
      .toBe(mediaType === "tv" ? 1 : 0);
    if (mediaType === "tv") {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const [item] = JSON.parse(
              localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
            );
            return item && [item.season, item.episode];
          }),
        )
        .toEqual([1, 2]);
    }
    if (mediaType === "tv") {
      for (let count = 1; count <= 4; count++) {
        await page.evaluate(() => {
          const session = window.nativeCalls.findLast(
            (call) => call.command === "start_native_media",
          );
          window.nativeEmit({
            sessionId: session.args.sessionId,
            kind: "complete",
          });
          window.nativeEmit({
            sessionId: session.args.sessionId,
            kind: "closed",
          });
        });
        if (count < 4) {
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  window.nativeCalls.filter(
                    (call) => call.command === "start_native_media",
                  ).length,
              ),
            )
            .toBe(count + 1);
          const title = await page.evaluate(
            () =>
              window.nativeCalls.findLast(
                (call) => call.command === "start_native_media",
              ).args.ui.title,
          );
          expect(title).toContain(["S1 E2", "S23 E1", "S23 E2"][count - 1]);
          await expect(page.locator("#fullscreenPlayback")).toBeVisible();
          await page.waitForTimeout(100);
        }
      }
      await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
      await expect(page).toHaveURL(/\/title\/tv\/505/);
      return;
    }
    await page.evaluate(() => {
      const session = window.nativeCalls.find(
        (call) => call.command === "start_native_media",
      );
      window.nativeEmit({ sessionId: session.args.sessionId, kind: "closed" });
    });
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
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
}
