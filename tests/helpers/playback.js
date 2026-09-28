import { expect } from "@playwright/test";
import path from "node:path";

const title = {
  id: 505,
  external_ids: { imdb_id: "tt0505000" },
  title: "Playback Test",
  name: "Playback Test",
  overview: "A deterministic playback test.",
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  release_date: "2024-01-01",
  first_air_date: "2024-01-01",
  genres: [],
  seasons: [{ season_number: 1, name: "Season 1", episode_count: 2 }],
};

export async function mockPlayback({ page, baseURL }, enableLegacy = true) {
  if (enableLegacy !== false) {
    await page.route("**/scripts/config.js", async (route) => {
      const response = await route.fetch();
      await route.fulfill({
        response,
        body: `${await response.text()}\nwindow.RAINFLIX_CONFIG.yastream.enabled = true;\nwindow.RAINFLIX_CONFIG.torrentio.enabled = true;`,
      });
    });
  }
  await page.addInitScript(() => localStorage.clear());
  await page.route("https://api.themoviedb.org/3/**", (route) => {
    const url = new URL(route.request().url());
    const body = /\/(movie|tv)\/505$/.test(url.pathname)
      ? title
      : url.pathname.endsWith("/season/1")
        ? {
            season_number: 1,
            episodes: [
              { episode_number: 1, name: "First" },
              { episode_number: 2, name: "Second" },
            ],
          }
        : { results: [] };
    return route.fulfill({ json: body });
  });
  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      path: "public/rainflix-preview.jpg",
      contentType: "image/jpeg",
    }),
  );
  await page.route("https://vidsrc.to/**", (route) =>
    route.fulfill({
      body: "<html><body>Embed test</body></html>",
      contentType: "text/html",
    }),
  );
  await page.route(`${baseURL}/__media__/**`, (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").at(-1);
    const files = {
      "player-sample.mp4": "video/mp4",
      "player-sample.m3u8": "application/vnd.apple.mpegurl",
      "player-sample0.mpegts": "video/mp2t",
    };
    if (filename === "captions.srt") {
      return route.fulfill({
        contentType: "text/plain",
        body: "1\n00:00:00,000 --> 00:00:02,800\nTest captions\n",
      });
    }
    return files[filename]
      ? route.fulfill({
          path: path.join("tests", "fixtures", filename),
          contentType: files[filename],
        })
      : route.fulfill({ status: 404 });
  });
}

export async function openPlayer(page, type = "movie") {
  await page.goto(`/#/watch/${type}/505/1/1`);
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
}

export async function closePlayer(page) {
  const close = page.getByRole("button", { name: "Close player", exact: true });
  if (await close.count()) {
    await close.click();
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  }
}

export async function selectPlayer(page, id) {
  await closePlayer(page);
  const episode = page.locator('[data-video-id][aria-pressed="true"]');
  if (await episode.count()) {
    await episode.click();
    await expect(
      page.getByRole("heading", { name: "Players", exact: true }),
    ).toBeVisible();
  }
  const back = page.getByRole("button", {
    name: /^(Back to players|Cancel stream lookup)$/,
  });
  if (await back.count()) await back.click();
  const labels = {
    vidsrc: "VidSrc",
    yastream: "Yastream",
    torrentio: "Torrentio",
  };
  await page
    .getByRole("button", { name: `Play with ${labels[id] || id}`, exact: true })
    .click();
  if (id === "vidsrc")
    await expect(page.locator("#fullscreenPlayback")).toBeVisible();
}

export async function selectStream(page, id) {
  await closePlayer(page);
  await page.locator(`button[data-stream-id="${id}"]`).click();
  await expect(page.locator("#fullscreenPlayback")).toBeVisible();
}

export async function selectCaptions(page, label) {
  await page.getByRole("button", { name: "Subtitles", exact: true }).click();
  await page
    .getByRole("group", { name: "Subtitles", exact: true })
    .getByRole("button", { name: label, exact: true })
    .click();
}

export async function selectEpisode(page, episode, provider) {
  await closePlayer(page);
  const sourceBack = page.getByRole("button", {
    name: /^(Back to players|Cancel stream lookup)$/,
  });
  if (await sourceBack.count()) await sourceBack.click();
  const episodeBack = page.getByRole("button", {
    name: "Back to episodes",
    exact: true,
  });
  if (await episodeBack.count()) await episodeBack.click();
  await page
    .getByRole("button", {
      name: `${episode}. ${episode === 1 ? "First" : "Second"}`,
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Players", exact: true }),
  ).toBeVisible();
  if (provider) await selectPlayer(page, provider);
}

export async function history(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1") || "[]"),
  );
}
