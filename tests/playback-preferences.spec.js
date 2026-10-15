import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  selectPlayer,
  selectStream,
  closePlayer,
} from "./helpers/playback.js";

test.beforeEach(mockPlayback);

test("resuming a torrent prefers its exact file even when labels or peer counts change", async ({
  page,
}) => {
  await page.goto("/#/home");
  const result = await page.evaluate(async () => {
    const {
      resumeStreamPreference,
      preferredResumeStream,
      savePlaybackPreferences,
    } = await import("/src/lib/playback-preferences.js");
    const { readSyncData, writeSyncData } =
      await import("/src/lib/sync-data.js");
    const torrent = { infoHash: "a".repeat(40), fileIdx: 3 };
    const quality = await resumeStreamPreference({
      label: "1080p x265 15 peers",
      torrent,
    });
    const selected = await preferredResumeStream(
      [
        {
          id: "wrong-file",
          label: "1080p x265",
          torrent: { ...torrent, fileIdx: 0 },
        },
        { id: "last-file", label: "1080p x265 99 peers", torrent },
      ],
      quality,
    );
    savePlaybackPreferences(
      { id: 505, mediaType: "movie" },
      {
        providerId: "torrentio",
        quality,
        tracks: { sub: { lang: "en" }, audio: { lang: "ja" } },
        url: "https://private/token",
      },
    );
    const value = readSyncData(localStorage)["playback/movie:505"];
    localStorage.removeItem("rainflix:playback-preferences:v1");
    writeSyncData(localStorage, {
      "playback/movie:505": {
        record_key: "playback/movie:505",
        value,
        changed_at: 100,
      },
    });
    return {
      selected: selected.id,
      value,
      saved: localStorage.getItem("rainflix:playback-preferences:v1"),
    };
  });
  expect(result.selected).toBe("last-file");
  expect(result.value.quality.sourceKey).toMatch(/^[a-f0-9]{64}$/);
  expect(result.saved).not.toContain("a".repeat(40));
  expect(result.saved).not.toContain("https://private");
  expect(result.value.tracks).toMatchObject({
    sub: { lang: "en" },
    audio: { lang: "ja" },
  });
});

test("synced resume finds an installed provider with a different device ID", async ({
  page,
  baseURL,
}) => {
  const manifest = "https://resume.example/manifest.json";
  await page.route("https://resume.example/**", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("manifest.json")
        ? {
            id: "resume.test",
            name: "Resume Test",
            resources: ["stream"],
            types: ["movie"],
          }
        : {
            streams: [
              {
                name: "720p",
                url: `${baseURL}/__media__/player-sample.mp4?quality=720`,
              },
              {
                name: "1080p",
                url: `${baseURL}/__media__/player-sample.mp4?quality=1080`,
              },
            ],
          },
    }),
  );
  await openPlayer(page);
  await page.evaluate(async (manifest) => {
    const { installAddon, syncAddonKey } = await import("/src/lib/addons.js");
    const { savePlaybackPreferences, streamPreference } =
      await import("/src/lib/playback-preferences.js");
    await installAddon(manifest);
    savePlaybackPreferences(
      { id: 505, mediaType: "movie" },
      {
        providerId: "addon:another-device",
        providerKey: await syncAddonKey(manifest),
        quality: streamPreference({ label: "1080p" }),
      },
    );
    localStorage.setItem(
      "rainflix:recently-viewed:v1",
      JSON.stringify([
        {
          id: 505,
          mediaType: "movie",
          title: "Playback Test",
          season: 1,
          episode: 1,
          viewedAt: Date.now(),
        },
      ]),
    );
  }, manifest);
  await page.evaluate(() =>
    window.dispatchEvent(
      new StorageEvent("storage", { key: "rainflix:recently-viewed:v1" }),
    ),
  );
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("link", { name: "Continue watching Playback Test" })
    .click();
  await page
    .getByRole("button", { name: "Continue watching", exact: true })
    .click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect(page.locator("#playerShell video")).toHaveAttribute(
    "src",
    /quality=1080/,
  );
});

test("sidebar playback handoffs stay in memory and start the chosen episode source", async ({
  page,
  baseURL,
}) => {
  await openPlayer(page, "tv");
  const token = await page.evaluate(async (baseURL) => {
    const { handoffPlayback } = await import("/src/lib/playback-handoff.js");
    const token = handoffPlayback({
      providerId: "yastream",
      stream: {
        id: "sidebar-choice",
        label: "Selected stream",
        url: `${baseURL}/__media__/player-sample.mp4?sidebar=1`,
      },
    });
    history.pushState(
      { ...history.state, usr: { rainflixEpisodePlayback: token } },
      "",
      "#/title/tv/505?season=1&episode=2",
    );
    dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
    return token;
  }, baseURL);
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect(page.locator("#playerShell video")).toHaveAttribute(
    "src",
    /sidebar=1/,
  );
  const stored = await page.evaluate(() =>
    JSON.stringify({
      local: { ...localStorage },
      session: { ...sessionStorage },
      history: history.state,
    }),
  );
  expect(stored).not.toContain("sidebar=1");
  const consumed = await page.evaluate(async (token) => {
    const { readPlaybackHandoff } =
      await import("/src/lib/playback-handoff.js");
    return readPlaybackHandoff(token) === undefined;
  }, token);
  expect(consumed).toBe(true);
  await closePlayer(page);
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
});

test("remembers quality and track choices without retaining stream URLs", async ({
  page,
}) => {
  await openPlayer(page);
  const result = await page.evaluate(async () => {
    const preferences = await import("/src/lib/playback-preferences.js");
    const details = { tmdbDetails: { id: 505, mediaType: "tv" } };
    preferences.savePlaybackPreferences(details, {
      providerId: "addon:test",
      quality: preferences.streamPreference({
        label: "1080p HEVC",
        url: "https://private.example/?token=secret",
      }),
      tracks: { sub: { lang: "eng" }, audio: { lang: "jpn" } },
    });
    const reloaded = await import("/src/lib/playback-preferences.js?reload=1");
    const saved = reloaded.readPlaybackPreferences(details);
    const chosen = preferences.preferredStream(
      [
        { id: "a", label: "720p" },
        { id: "b", label: "1080p HEVC" },
        { id: "c", label: "1080p", blockedReason: "Unavailable" },
      ],
      saved.quality,
    );
    return {
      saved,
      chosen: chosen.id,
      storage: localStorage.getItem("rainflix:playback-preferences:v1"),
    };
  });
  expect(result.saved.tracks).toEqual({
    sub: { lang: "eng" },
    audio: { lang: "jpn" },
  });
  expect(result.chosen).toBe("b");
  expect(result.storage).not.toMatch(/private|secret|https:/);
});

test("next episode matches release group and quality without silently downgrading", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { preferredEpisodeStream } =
      await import("/src/lib/playback-preferences.js");
    const current = {
      label: "Episode 1 1080p x265",
      bingeGroup: "release-group",
      torrent: { infoHash: "season-pack" },
    };
    const streams = [
      {
        id: "lower",
        label: "Episode 2 720p x265",
        bingeGroup: "release-group",
      },
      { id: "other", label: "Episode 2 1080p x265", bingeGroup: "other-group" },
      {
        id: "matching",
        label: "Episode 2 1080p HEVC",
        bingeGroup: "release-group",
      },
      {
        id: "pack",
        label: "Episode 2 1080p H.265",
        bingeGroup: "release-group",
        torrent: { infoHash: "season-pack", fileIdx: 4 },
      },
    ];
    return {
      matched: preferredEpisodeStream(streams, current)?.id,
      group: preferredEpisodeStream(streams.slice(0, 3), current)?.id,
      incompatible: preferredEpisodeStream([streams[0]], current) || null,
    };
  });
  expect(result).toEqual({
    matched: "pack",
    group: "matching",
    incompatible: null,
  });
});

test("Continue Watching resolves a fresh preferred stream and autoplays", async ({
  page,
  baseURL,
}) => {
  let lookups = 0;
  await page.route("https://yastream.tamthai.de/**", (route) => {
    if (route.request().url().includes("/subtitles/"))
      return route.fulfill({ json: { subtitles: [] } });
    lookups++;
    return route.fulfill({
      json: {
        streams: [
          {
            name: "720p",
            url: `${baseURL}/__media__/player-sample.mp4?quality=720&fresh=${lookups}`,
          },
          {
            name: "1080p",
            url: `${baseURL}/__media__/player-sample.mp4?quality=1080&fresh=${lookups}`,
          },
        ],
      },
    });
  });
  await openPlayer(page);
  await selectPlayer(page, "yastream");
  await selectStream(page, "1");
  await expect
    .poll(() =>
      page.locator("#playerShell video").evaluate((video) => video.currentTime),
    )
    .toBeGreaterThan(0);
  await closePlayer(page);
  const previous = lookups;
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page
    .getByRole("link", { name: "Continue watching Playback Test" })
    .click();
  await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Continue watching", exact: true })
    .click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
  await expect(page.locator("#playerShell video")).toHaveAttribute(
    "src",
    /quality=1080/,
  );
  expect(lookups).toBeGreaterThan(previous);
});

test("add-on registrations survive loss of tab session storage without storing manifests", async ({
  page,
}) => {
  await page.route("https://persistent.example/manifest.json", (route) =>
    route.fulfill({
      json: {
        id: "persistent",
        name: "Persistent",
        types: ["movie"],
        resources: ["stream"],
        description: "not persisted response",
      },
    }),
  );
  await openPlayer(page);
  await page.evaluate(async () => {
    const { installAddon } = await import("/src/lib/addons.js");
    await installAddon("https://persistent.example/manifest.json");
  });
  const registrations = await page.evaluate(async () =>
    (await import("/src/lib/addon-storage.js")).addonRegistrations(),
  );
  expect(registrations).toHaveLength(1);
  expect(registrations[0]).not.toHaveProperty("manifest");
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const storage = await import("/src/lib/addon-storage.js");
        return (await storage.addonRegistrations()).length;
      }),
    )
    .toBe(1);
  await page.evaluate(() => {
    location.hash = "/addons";
  });
  await page.getByRole("tab", { name: /^Installed/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove Persistent" }),
  ).toBeVisible();
});
