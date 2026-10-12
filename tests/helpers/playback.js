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
  videos: {
    results: [
      {
        key: "trailer_fixture",
        site: "YouTube",
        type: "Trailer",
        official: true,
      },
    ],
  },
  seasons: [{ season_number: 1, name: "Season 1", episode_count: 2 }],
};

export async function mockPlayback(
  { page, baseURL },
  enableLegacy = true,
  preserveStorage = false,
) {
  await page.route("**/scripts/config.js", async (route) => {
    const response = await route.fetch({ maxRetries: 2 });
    await route.fulfill({
      response,
      body: `${await response.text()}\nwindow.RAINFLIX_CONFIG.webDefaultAddons = [];window.RAINFLIX_CONFIG.nativeDefaultAddons = [];${enableLegacy !== false ? "\nwindow.RAINFLIX_CONFIG.yastream.enabled = true;\nwindow.RAINFLIX_CONFIG.torrentio.enabled = true;" : ""}`,
    });
  });
  if (!preserveStorage) await page.addInitScript(() => localStorage.clear());
  await page.route("https://api.country.is/", (route) =>
    route.fulfill({ json: { country: "US" } }),
  );
  await page.route("https://stremio-addons.net/api/v0/**", (route) =>
    route.fulfill({
      json: { categories: [], addons: [], pagination: { hasNextPage: false } },
    }),
  );
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({ json: { streams: [], subtitles: [] } }),
  );
  await page.route("https://torrentio.strem.fun/**", (route) =>
    route.fulfill({ json: { streams: [] } }),
  );
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
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
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
  if (await page.locator("#fullscreenPlayback").count()) {
    await page.keyboard.press("Escape");
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
  }
}

export async function selectPlayer(page, id, episodeNumber) {
  await closePlayer(page);
  if (id === "trailer") {
    await page
      .getByRole("button", { name: "Play trailer", exact: true })
      .click();
    await expect(page.locator("#fullscreenPlayback")).toBeVisible();
    return;
  }
  const labels = {
    yastream: "Yastream",
    torrentio: "Torrentio",
  };
  const provider = page.getByRole("button", {
    name: `Play with ${labels[id] || id}`,
    exact: true,
  });
  for (let step = 0; step < 3 && !(await provider.count()); step++) {
    const back = page.getByRole("button", {
      name: /^(Back to streams|Back to episodes|Cancel stream lookup)$/,
    });
    if (await back.count()) await back.click();
    else {
      const episode = page.locator('[data-video-id][aria-pressed="true"]');
      if (await episode.count()) await episode.click();
      else break;
    }
  }
  await provider.click();
  if (new URL(page.url()).hash.startsWith("#/title/tv/")) {
    await expect(
      page.getByRole("region", { name: "Episodes", exact: true }),
    ).toBeVisible();
  }
  const episode = episodeNumber
    ? page.getByRole("button", {
        name: `${episodeNumber}. ${episodeNumber === 1 ? "First" : "Second"}`,
        exact: true,
      })
    : page.locator('[data-video-id][aria-pressed="true"]');
  if (await episode.count()) await episode.click();
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
  await selectPlayer(page, provider || "yastream", episode);
}

export async function history(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1") || "[]"),
  );
}
