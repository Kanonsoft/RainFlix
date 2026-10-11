import { expect, test } from "@playwright/test";
import {
  mockPlayback,
  openPlayer,
  selectPlayer,
  selectCaptions,
} from "./helpers/playback.js";

test.beforeEach(mockPlayback);

test("subtitle groups merge language aliases while preserving variants", async ({
  page,
}) => {
  await page.goto("/");
  const groups = await page.evaluate(async () => {
    const { groupSubtitlesByLanguage } =
      await import("/src/lib/addon-streams.js");
    return groupSubtitlesByLanguage([
      { lang: "eng", label: "Provider A", url: "a" },
      { lang: "en-US", label: "Provider B", url: "b" },
      { lang: "fra", label: "French", url: "c" },
      { lang: "en", label: "SDH", url: "d" },
      { lang: "und", label: "Unknown", url: "e" },
      { lang: "zh-Hans", label: "Simplified", url: "f" },
      { lang: "zh-Hant", label: "Traditional", url: "g" },
    ]);
  });
  expect(
    groups
      .find((group) => group.name === "English")
      .tracks.map((track) => track.url),
  ).toEqual(["a", "b", "d"]);
  expect(groups.find((group) => group.name === "French").tracks).toHaveLength(
    1,
  );
  expect(
    groups.find((group) => group.name === "Unspecified language").tracks,
  ).toHaveLength(1);
  expect(groups.filter((group) => group.name.includes("Chinese"))).toHaveLength(
    2,
  );
});

test("separate subtitle add-ons match the episode and load only the selected subtitle", async ({
  page,
  baseURL,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "rainflix:addons:session:v1",
      JSON.stringify([
        {
          id: "addon:subs",
          enabled: true,
          manifestUrl: "https://subs.example/manifest.json",
          manifest: {
            id: "test.subtitles",
            name: "Community Subs",
            types: ["movie", "series"],
            resources: ["subtitles"],
          },
        },
      ]),
    ),
  );
  const lookups = [];
  await page.route("https://subs.example/**", (route) => {
    lookups.push(route.request().url());
    return route.fulfill({
      json: {
        subtitles: [
          { id: "en", lang: "eng", url: `${baseURL}/__media__/captions.srt` },
          {
            id: "fr",
            lang: "fra",
            url: `${baseURL}/__media__/captions.srt?fr=1`,
          },
        ],
      },
    });
  });
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("/stream/")
        ? {
            streams: [
              {
                name: "Video",
                url: `${baseURL}/__media__/player-sample.mp4`,
                behaviorHints: {
                  filename: "Series.S01E01.mp4",
                  videoHash: "0123456789abcdef",
                  videoSize: 12345,
                },
              },
            ],
          }
        : { subtitles: [] },
    }),
  );
  const downloads = [];
  page.on("request", (request) => {
    if (request.url().includes("captions.srt")) downloads.push(request.url());
  });
  await openPlayer(page, "tv");
  expect(lookups).toHaveLength(0);
  await selectPlayer(page, "yastream");
  await expect.poll(() => lookups.length).toBe(1);
  const path = decodeURIComponent(new URL(lookups[0]).pathname);
  expect(path).toContain("/subtitles/series/tt0505000:1:1/");
  expect(path).toContain("filename=Series.S01E01.mp4");
  expect(path).toContain("videoHash=0123456789abcdef");
  expect(downloads).toHaveLength(0);
  await selectCaptions(page, "Community Subs / English");
  await expect.poll(() => downloads.length).toBe(1);
  await expect
    .poll(() =>
      page
        .locator("#playerShell video")
        .evaluate((video) => video.textTracks[0]?.cues?.length),
    )
    .toBe(1);
  await page
    .locator("#playerShell video")
    .evaluate((video) => video.dispatchEvent(new Event("waiting")));
  await expect(page.locator("#playerShell img.object-cover")).toHaveCount(0);
  await expect(
    page.getByRole("progressbar").locator("img").first(),
  ).toHaveAttribute("src", /rainflix-r\.png$/);
});

test("a failed subtitle add-on does not suppress successful results", async ({
  page,
}) => {
  await page.route("https://good.example/**", (route) =>
    route.fulfill({
      json: {
        subtitles: [{ url: "https://captions.example/en.srt", lang: "eng" }],
      },
    }),
  );
  await page.route("https://bad.example/**", (route) =>
    route.fulfill({ status: 503 }),
  );
  let disabledRequests = 0;
  await page.route("https://disabled.example/**", (route) => {
    disabledRequests++;
    return route.fulfill({ json: { subtitles: [] } });
  });
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { installedSubtitles } = await import("/src/lib/addons.js");
    const addons = ["good", "bad", "disabled"].map((id) => ({
      id,
      enabled: id !== "disabled",
      manifestUrl: `https://${id}.example/manifest.json`,
      manifest: { name: id, types: ["movie"], resources: ["subtitles"] },
    }));
    return installedSubtitles(
      addons,
      { imdbId: "tt0505000", mediaType: "movie" },
      1,
      1,
      {},
      new AbortController().signal,
    );
  });
  expect(result.failed).toBe(true);
  expect(result.subtitles).toHaveLength(1);
  expect(result.subtitles[0].lang).toBe("en");
  expect(disabledRequests).toBe(0);
});
