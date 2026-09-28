import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

for (const type of ["movie", "series"]) {
  test(`resolves an IMDb ${type} route without a metadata add-on`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "rainflix:addons:session:v1",
        JSON.stringify([
          {
            id: "catalog",
            enabled: true,
            manifestUrl: "https://catalog.example/manifest.json",
            manifest: {
              id: "catalog",
              name: "Catalog",
              types: ["movie", "series"],
              resources: ["catalog"],
            },
          },
          {
            id: "streams",
            enabled: true,
            manifestUrl: "https://streams.example/manifest.json",
            manifest: {
              id: "streams",
              name: "Streams",
              types: ["movie", "series"],
              idPrefixes: ["tt"],
              resources: ["stream"],
            },
          },
        ]),
      ),
    );
    const lookups = [];
    await page.route("https://api.themoviedb.org/3/find/**", (route) => {
      lookups.push(new URL(route.request().url()));
      return route.fulfill({
        json: {
          movie_results: type === "movie" ? [{ id: 505 }] : [],
          tv_results: type === "series" ? [{ id: 505 }] : [],
        },
      });
    });
    await page.route("https://api.themoviedb.org/3/tv/505?*", (route) =>
      route.fulfill({
        json: {
          id: 505,
          name: "Playback Test",
          external_ids: { imdb_id: "tt9335498" },
          seasons: [
            { season_number: 1, episode_count: 2 },
            { season_number: 2, episode_count: 1 },
          ],
        },
      }),
    );
    await page.route(
      "https://api.themoviedb.org/3/tv/505/season/2?*",
      (route) =>
        route.fulfill({
          json: {
            season_number: 2,
            episodes: [{ episode_number: 1, name: "Second season premiere" }],
          },
        }),
    );
    const streams = [];
    await page.route("https://streams.example/**", (route) => {
      streams.push(route.request().url());
      return route.fulfill({ json: { streams: [] } });
    });
    await page.goto(`/#/addon/catalog/title/${type}/tt9335498`);
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: "Playback Test", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Metadata provider", exact: true }),
    ).toHaveCount(0);
    expect(lookups[0].pathname).toBe("/3/find/tt9335498");
    expect(lookups[0].searchParams.get("external_source")).toBe("imdb_id");
    expect(streams).toHaveLength(0);
    await page
      .getByRole("button", { name: "Play with Streams", exact: true })
      .click();
    await expect
      .poll(() => streams[0])
      .toBe(
        `https://streams.example/stream/${type}/tt9335498${type === "series" ? "%3A1%3A1" : ""}.json`,
      );
    if (type === "series") {
      await page
        .getByRole("combobox", { name: "Season", exact: true })
        .selectOption("2");
      await expect(
        page.getByRole("combobox", { name: "Episode", exact: true }),
      ).toContainText("Second season premiere");
      await page
        .getByRole("button", { name: "Play with Streams", exact: true })
        .click();
      await expect
        .poll(() => streams.at(-1))
        .toBe("https://streams.example/stream/series/tt9335498%3A2%3A1.json");
    }
    await page.reload();
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Playback Test", level: 1 }),
    ).toBeVisible({ timeout: 15000 });
  });
}
