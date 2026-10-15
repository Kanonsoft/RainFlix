import { test, expect } from "@playwright/test";
import {
  readSyncData,
  captureChanges,
  mergeSyncRecords,
  writeSyncData,
  syncValuesEqual,
} from "../src/lib/sync-data.js";
import { mockPlayback } from "./helpers/playback.js";
import { createHash } from "node:crypto";
import { parseAccountCallback } from "../src/lib/account-oauth.js";
import {
  defaultSyncOptions,
  selectedSyncRecords,
} from "../src/lib/sync-data.js";

test("database JSON key ordering does not generate new edits or storage events", () => {
  const first = {
    id: 5,
    mediaType: "movie",
    title: "A",
    poster: "",
    backdrop: "",
    logo: "",
  };
  const second = {
    title: "A",
    mediaType: "movie",
    id: 5,
    logo: "",
    backdrop: "",
    poster: "",
  };
  expect(syncValuesEqual(first, second)).toBe(true);
  const journal = captureChanges({}, {}, { "list/movie:5": first }, 10);
  expect(
    captureChanges(
      journal,
      { "list/movie:5": first },
      { "list/movie:5": second },
      20,
    ),
  ).toEqual(journal);
  const storage = storageFixture({
    "rainflix:my-list:v1": JSON.stringify([second]),
  });
  const events = [];
  writeSyncData(storage, journal, (key) => events.push(key), {
    ...defaultSyncOptions,
    history: false,
    watched: false,
    settings: false,
  });
  expect(events).toEqual([]);
});

test("all sync categories default on; deselected categories are not uploaded or applied", () => {
  expect(Object.values(defaultSyncOptions).every(Boolean)).toBe(true);
  const records = {
    "list/movie:5": true,
    "recent/movie:5": true,
    "progress/tmdb:movie:5": true,
    "addons/key": true,
  };
  const options = { ...defaultSyncOptions, history: false, addons: false };
  expect(selectedSyncRecords(records, options)).toEqual({
    "list/movie:5": true,
  });
  const storage = storageFixture({
    "rainflix:my-list:v1": "[]",
    "rainflix:recently-viewed:v1": '[{"id":9,"mediaType":"movie"}]',
  });
  writeSyncData(
    storage,
    {
      "recent/movie:5": {
        record_key: "recent/movie:5",
        value: { id: 5, mediaType: "movie" },
        changed_at: 10,
      },
    },
    () => {},
    options,
  );
  expect(JSON.parse(storage.getItem("rainflix:recently-viewed:v1"))[0].id).toBe(
    9,
  );
});

test("OAuth callback accepts only the exact route and a single correlated code", () => {
  const attempt = "a".repeat(64);
  expect(
    parseAccountCallback(
      `rainflix://auth/callback?code=code-1&attempt=${attempt}`,
    )?.code,
  ).toBe("code-1");
  for (const address of [
    `https://auth/callback?code=x&attempt=${attempt}`,
    `rainflix://wrong/callback?code=x&attempt=${attempt}`,
    `rainflix://auth/other?code=x&attempt=${attempt}`,
    `rainflix://user@auth/callback?code=x&attempt=${attempt}`,
    `rainflix://auth/callback?code=x&code=y&attempt=${attempt}`,
    `rainflix://auth/callback?code=x&attempt=${attempt}#access_token=secret`,
    "rainflix://auth/callback?code=x",
  ])
    expect(parseAccountCallback(address)).toBeNull();
});

function storageFixture(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
  };
}
test("sync excludes device settings, credentials and stream URLs", () => {
  const storage = storageFixture({
    "rainflix:settings:v1": JSON.stringify({
      fullscreenOnStart: true,
      reduceAnimations: true,
      skipIntro: true,
      subtitleLanguage: "en",
    }),
    "rainflix:my-list:v1": JSON.stringify([
      {
        id: 5,
        mediaType: "movie",
        title: "Movie",
        streamUrl: "https://private.example/token",
        manifestUrl: "https://addon/token",
        poster: "https://private.example/art?token=secret",
      },
    ]),
  });
  const data = readSyncData(storage);
  expect(data["settings/skipIntro"]).toBe(true);
  expect(data["settings/fullscreenOnStart"]).toBeUndefined();
  expect(data["settings/reduceAnimations"]).toBeUndefined();
  expect(JSON.stringify(data)).not.toContain("private.example");
  expect(JSON.stringify(data)).not.toContain("manifestUrl");
});
test("offline removal survives stale remote data; later re-add wins", () => {
  const initial = { "list/movie:5": { id: 5, mediaType: "movie" } };
  const saved = captureChanges({}, {}, initial, 100);
  const removed = captureChanges(saved, initial, {}, 200);
  expect(
    mergeSyncRecords(removed, Object.values(saved))["list/movie:5"].deleted,
  ).toBe(true);
  const added = captureChanges(removed, {}, initial, 300);
  expect(
    mergeSyncRecords(removed, Object.values(added))["list/movie:5"].deleted,
  ).toBe(false);
});
test("remote progress merges without replacing other titles or local display settings", () => {
  const storage = storageFixture({
    "rainflix:settings:v1": JSON.stringify({
      reduceAnimations: true,
      fullscreenOnStart: true,
    }),
  });
  const local = captureChanges(
    {},
    {},
    { "list/movie:5": { id: 5, mediaType: "movie", title: "Saved" } },
    200,
  );
  const remote = captureChanges(
    {},
    {},
    {
      "progress/imdb:tv:tt123:s2:e1": {
        position: 120,
        duration: 1000,
        updatedAt: 300,
      },
      "settings/subtitleLanguage": "ja",
    },
    300,
  );
  writeSyncData(storage, mergeSyncRecords(local, Object.values(remote)));
  expect(JSON.parse(storage.getItem("rainflix:my-list:v1"))[0].id).toBe(5);
  expect(
    JSON.parse(storage.getItem("rainflix:playback-progress:v1"))[0][1].position,
  ).toBe(120);
  expect(JSON.parse(storage.getItem("rainflix:settings:v1"))).toEqual({
    reduceAnimations: true,
    fullscreenOnStart: true,
    subtitleLanguage: "ja",
  });
});

for (const android of [false, true])
  test(`Google PKCE sign in, automatic sync and sign out on ${android ? "Android" : "Windows"}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await mockPlayback({ page, baseURL }, false, true);
    await page.setViewportSize({ width: android ? 390 : 1440, height: 900 });
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: `export const isNativeApp=true,isAndroid=${android},isDesktop=${!android},browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}`,
      }),
    );
    const requests = [];
    const localManifest =
      "https://local-addon.example/private-token/manifest.json";
    const remoteManifest =
      "https://cloud-addon.example/cloud-token/manifest.json";
    const addonKey = (url) =>
      `addons/${createHash("sha256").update(url).digest("hex")}`;
    const cloud = new Map([
      [
        addonKey(remoteManifest),
        {
          record_key: addonKey(remoteManifest),
          changed_at: Date.now() - 1000,
          deleted: false,
          value: {
            id: "addon:cloud-provider",
            manifestUrl: remoteManifest,
            enabled: false,
            name: "Cloud add-on",
          },
        },
      ],
    ]);
    let lastChanges = [];
    for (const manifest of [localManifest, remoteManifest])
      await page.route(manifest, (route) =>
        route.fulfill({
          json: {
            id: manifest.includes("local-addon")
              ? "local.provider"
              : "cloud.provider",
            name: manifest.includes("local-addon")
              ? "Local add-on"
              : "Cloud add-on",
            types: ["movie", "series"],
            resources: ["stream"],
          },
        }),
      );
    await page.addInitScript(() => {
      window.isTauri = true;
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: "main" } },
        transformCallback: () => 1,
        async invoke(command, args) {
          if (command === "plugin:opener|open_url") window.oauthUrl = args.url;
          if (
            command === "plugin:native-player|take_install_link" ||
            command === "take_addon_install_link"
          ) {
            const url = window.pendingAuth || null;
            window.pendingAuth = null;
            return command === "take_addon_install_link" ? url : { url };
          }
          if (command.includes("listen") || command.includes("Listener"))
            return 1;
        },
      };
    });
    await page.route("https://wrsyztvvrpkckqbqtstz.supabase.co/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      requests.push(path);
      if (path.endsWith("/token")) {
        const payload = route.request().postDataJSON();
        expect(payload.auth_code).toBe("test-auth-code");
        expect(payload.code_verifier.length).toBeGreaterThan(40);
        return route.fulfill({
          json: {
            access_token: "test-token",
            refresh_token: "test-refresh",
            token_type: "bearer",
            expires_in: 3600,
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "rainflix@example.com",
              aud: "authenticated",
              role: "authenticated",
            },
          },
        });
      }
      if (path.endsWith("/merge_rainflix_sync")) {
        lastChanges = route.request().postDataJSON().changes;
        for (const row of lastChanges)
          if (
            !cloud.has(row.record_key) ||
            cloud.get(row.record_key).changed_at < row.changed_at
          )
            cloud.set(row.record_key, row);
        return route.fulfill({
          json: [
            ...cloud.values(),
            {
              record_key: "settings/subtitleLanguage",
              value: "ja",
              changed_at: Date.now(),
              deleted: false,
            },
          ],
        });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto("/#/settings/account");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(page.locator("#appLoader")).toHaveCSS("opacity", "0");
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath("account.png"),
      fullPage: true,
    });
    for (const option of await page.getByRole("switch").all())
      await expect(option).toBeChecked();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toHaveCSS("background-color", "rgb(255, 255, 255)");
    const localAddonId = await page.evaluate(async (url) => {
      const { installAddon } = await import("/src/lib/addons.js");
      return (await installAddon(url)).id;
    }, localManifest);
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await expect
      .poll(() => page.evaluate(() => window.oauthUrl), { timeout: 15000 })
      .toBeTruthy();
    const authorization = new URL(await page.evaluate(() => window.oauthUrl));
    expect(authorization.searchParams.get("provider")).toBe("google");
    expect(authorization.searchParams.get("code_challenge_method")).toBe(
      "s256",
    );
    const redirect = new URL(authorization.searchParams.get("redirect_to"));
    expect(`${redirect.protocol}//${redirect.host}${redirect.pathname}`).toBe(
      "rainflix://auth/callback",
    );
    const callback = new URL(redirect);
    callback.searchParams.set("code", "test-auth-code");
    const mismatched = new URL(callback);
    mismatched.searchParams.set("attempt", "0".repeat(64));
    await page.evaluate(async (url) => {
      const { receiveAccountCallback } =
        await import("/src/lib/account-sync.js");
      await receiveAccountCallback(url);
    }, mismatched.href);
    expect(requests.some((path) => path.endsWith("/token"))).toBe(false);
    await page.addInitScript((url) => {
      window.pendingAuth = url;
    }, callback.href);
    await page.reload();
    await expect(
      page.getByText("rainflix@example.com", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Merge this device and enable sync" }),
    ).toHaveCount(0);
    await expect
      .poll(() => requests.some((path) => path.includes("merge_rainflix_sync")))
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("rainflix:settings:v1") || "{}")
              .subtitleLanguage,
        ),
      )
      .toBe("ja");
    expect(
      lastChanges.some((row) => row.record_key === addonKey(localManifest)),
    ).toBe(true);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { addonSyncData } = await import("/src/lib/addons.js");
          return Object.values((await addonSyncData()) || {}).some(
            (item) => item.name === "Cloud add-on" && !item.enabled,
          );
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain("private-token");
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage })),
    ).not.toContain("cloud-token");
    await page.getByRole("switch", { name: "Installed add-ons" }).uncheck();
    await page.evaluate(async (id) => {
      (await import("/src/lib/addons.js")).toggleAddon(id);
    }, localAddonId);
    await page.waitForTimeout(3500);
    expect(
      lastChanges.some((row) => row.record_key.startsWith("addons/")),
    ).toBe(false);
    await page.getByRole("switch", { name: "Installed add-ons" }).check();
    await expect
      .poll(() => cloud.get(addonKey(localManifest))?.value.enabled)
      .toBe(false);
    await page.evaluate(async (id) => {
      (await import("/src/lib/addons.js")).removeAddon(id);
    }, localAddonId);
    await expect
      .poll(() => cloud.get(addonKey(localManifest))?.deleted)
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "Sync now", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    const beforeIdle = requests.filter((path) =>
      path.includes("merge_rainflix_sync"),
    ).length;
    await page.clock.install();
    await page.clock.fastForward(120000);
    expect(
      requests.filter((path) => path.includes("merge_rainflix_sync")).length,
    ).toBe(beforeIdle);
    await page.evaluate(async () => {
      const { savePlaybackProgress } =
        await import("/src/lib/playback-progress.js");
      savePlaybackProgress(
        { key: "tmdb:movie:888", persistent: true },
        { position: 10, duration: 1000 },
      );
    });
    await page.clock.fastForward(5000);
    expect(
      requests.filter((path) => path.includes("merge_rainflix_sync")).length,
    ).toBe(beforeIdle);
    await page.clock.fastForward(55000);
    await expect
      .poll(
        () =>
          requests.filter((path) => path.includes("merge_rainflix_sync"))
            .length,
      )
      .toBe(beforeIdle + 1);
    await expect(
      page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeEnabled();
    await page.evaluate(async () => {
      const { savePlaybackProgress } =
        await import("/src/lib/playback-progress.js");
      savePlaybackProgress(
        { key: "tmdb:movie:888", persistent: true },
        { position: 20, duration: 1000 },
        true,
      );
    });
    await page.clock.fastForward(3000);
    await expect
      .poll(
        () =>
          requests.filter((path) => path.includes("merge_rainflix_sync"))
            .length,
      )
      .toBe(beforeIdle + 2);
    let releaseSync;
    let syncPending = false;
    const heldSync = new Promise((resolve) => {
      releaseSync = resolve;
    });
    await page.route("**/rest/v1/rpc/merge_rainflix_sync", async (route) => {
      syncPending = true;
      await heldSync;
      await route.fulfill({ json: [] }).catch(() => {});
    });
    await page.evaluate(async () => {
      const { saveAppSettings, readAppSettings } =
        await import("/src/lib/app-settings.js");
      saveAppSettings({ skipIntro: !readAppSettings().skipIntro });
    });
    await page.clock.fastForward(3000);
    await expect.poll(() => syncPending).toBe(true);
    try {
      await expect(
        page.getByRole("button", { name: "Sign out", exact: true }),
      ).toBeEnabled();
      await expect(page.getByText(/Last synced/)).toHaveCount(0);
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Continue with Google" }),
      ).toBeVisible();
    } finally {
      releaseSync();
    }
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
  });
