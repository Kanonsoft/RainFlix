import { test, expect } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

async function landingFixture(page, baseURL, trailer = true) {
  await mockPlayback({ page, baseURL }, false);
  const movie = {
    id: 505,
    title: "Trending Movie",
    media_type: "movie",
    backdrop_path: "/movie.jpg",
    poster_path: "/poster.jpg",
    release_date: "2026-01-01",
    vote_average: 8.2,
  };
  const anime = {
    id: 606,
    name: "Trending Anime",
    media_type: "tv",
    original_language: "ja",
    genre_ids: [16],
    backdrop_path: "/anime.jpg",
    poster_path: "/poster.jpg",
  };
  const drama = {
    id: 707,
    name: "Trending K-drama",
    media_type: "tv",
    original_language: "ko",
    genre_ids: [18],
    backdrop_path: "/drama.jpg",
    poster_path: "/poster.jpg",
  };
  await page.route("https://api.themoviedb.org/3/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("trending/movie/week"))
      return route.fulfill({ json: { results: [movie] } });
    if (url.pathname.endsWith("trending/all/week"))
      return route.fulfill({ json: { results: [movie, anime, drama] } });
    if (url.pathname.endsWith("trending/tv/week"))
      return route.fulfill({
        json: {
          results: [
            drama,
            { ...drama, id: 708, name: "Not drama", genre_ids: [35] },
          ],
        },
      });
    if (url.pathname.endsWith("movie/505"))
      return route.fulfill({
        json: {
          ...movie,
          overview: "A featured film with a story worth discovering.",
          runtime: 120,
          genres: [{ id: 53, name: "Thriller" }],
          credits: { cast: [{ id: 1, name: "Test Actor" }] },
          images: {
            logos: [{ file_path: "/title-logo.png", iso_639_1: "en" }],
            backdrops: [
              { file_path: "/still-1.jpg" },
              { file_path: "/still-2.jpg" },
            ],
          },
          videos: {
            results: trailer
              ? [
                  {
                    key: "trailer_fixture",
                    site: "YouTube",
                    type: "Trailer",
                    official: true,
                  },
                ]
              : [],
          },
        },
      });
    if (url.pathname.endsWith("tv/606"))
      return route.fulfill({ json: { ...anime, keywords: { results: [] } } });
    return route.fulfill({ json: { results: [], images: { logos: [] } } });
  });
  await page.route("https://image.tmdb.org/**", (route) =>
    route.fulfill({
      path: route.request().url().includes("title-logo")
        ? "assets/rainflix-wordmark.png"
        : "assets/startup/poster-01.jpg",
      contentType: route.request().url().includes("title-logo")
        ? "image/png"
        : "image/jpeg",
    }),
  );
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body style="margin:0;background:#11232c;color:white"><script>addEventListener('message',e=>{let d;try{d=JSON.parse(e.data)}catch{return}if(d.event==='listening'||d.func==='playVideo')parent.postMessage(JSON.stringify({event:'onStateChange',info:1}),e.origin);});</script></body></html>`,
    }),
  );
}

for (const width of [320, 390, 1440])
  test(`featured landing, looping carousels and section navigation at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await landingFixture(page, baseURL);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Trending Movie", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#appLoader")).toHaveCount(0);
    const trailerBox = await page
      .locator(".landing-trailer-frame")
      .boundingBox();
    expect(Math.abs(trailerBox.width - width * 0.92)).toBeLessThan(1);
    await expect(page.locator(".landing-trailer-poster")).toHaveClass(
      /is-playing/,
    );
    await expect(page.locator(".landing-ambient-video")).toHaveClass(
      /is-playing/,
    );
    await expect(page.locator(".landing-stills img")).toHaveCount(2);
    await expect(page.locator(".landing-cast")).toContainText("Test Actor");
    await expect(page.locator(".landing-feature")).toHaveCount(3);
    await expect(
      page.getByRole("link", { name: "Read about RainFlix" }),
    ).toHaveAttribute("href", "https://github.com/Kanonsoft/RainFlix#readme");
    const navigation = page.getByRole("navigation", {
      name: "Landing sections",
    });
    await expect(navigation.getByRole("button")).toHaveCount(3);
    if (width < 768) {
      await expect(navigation).toHaveCSS("position", "sticky");
      expect((await navigation.boundingBox()).y).toBeLessThan(150);
    }
    await expect(page.locator(".landing-watch-bar")).toBeHidden();
    const brand = page.locator(".landing-feature-brand");
    await expect(brand).toHaveCSS("position", "relative");
    const mediaBox = await page.locator(".landing-trailer-media").boundingBox();
    const expectedTrailerWidth = width * 0.92;
    expect(
      Math.abs(mediaBox.x - (width - expectedTrailerWidth) / 2),
    ).toBeLessThan(1);
    expect(Math.abs(mediaBox.width - expectedTrailerWidth)).toBeLessThan(1);
    expect(
      Math.abs(
        mediaBox.width / mediaBox.height - (width < 768 ? 16 / 9 : 21 / 9),
      ),
    ).toBeLessThan(0.01);
    const frameBox = await page
      .locator(".landing-trailer-media iframe")
      .boundingBox();
    for (const field of ["x", "y", "width", "height"])
      expect(Math.abs(frameBox[field] - mediaBox[field])).toBeLessThan(1);
    expect((await brand.boundingBox()).y).toBeGreaterThanOrEqual(
      mediaBox.y + mediaBox.height,
    );
    await expect(
      page.getByText("This week's most trending movie", { exact: true }),
    ).toHaveCount(0);
    await expect(brand).toHaveCSS("align-items", "center");
    await expect(brand.getByRole("link")).toHaveCSS("border-radius", "999px");
    await expect(page.locator(".landing-nav .landing-open")).toHaveCSS(
      "border-radius",
      "999px",
    );
    const logoBox = await brand.locator("h1").boundingBox();
    const downloadBox = await brand.getByRole("link").boundingBox();
    expect(
      Math.abs(
        logoBox.x + logoBox.width / 2 - (downloadBox.x + downloadBox.width / 2),
      ),
    ).toBeLessThan(2);
    if (width < 768)
      expect(
        Math.abs(downloadBox.x + downloadBox.width / 2 - width / 2),
      ).toBeLessThan(1);
    expect(downloadBox.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height);
    if (width < 768) {
      expect((await navigation.boundingBox()).width).toBe(width);
      await expect(navigation).toHaveCSS("border-radius", "0px");
    } else
      expect((await navigation.boundingBox()).width).toBeLessThan(width - 20);
    await navigation
      .getByRole("button", { name: "RainFlix", exact: true })
      .click();
    await expect(page.locator(".landing-watch-bar")).toBeVisible();
    await expect(page.locator(".landing-watch")).toHaveAttribute(
      "href",
      /#\/downloads$/,
    );
    if (width < 768) {
      await expect
        .poll(async () => (await navigation.boundingBox()).y)
        .toBeLessThan(20);
    }
    await expect(page.locator(".landing-watch-bar")).toHaveCSS(
      "position",
      "fixed",
    );
    await expect(page.locator(".landing-watch-bar")).toHaveCSS(
      "transition-duration",
      "0.48s, 0.35s, 0s",
    );
    expect((await page.locator(".landing-watch-bar").boundingBox()).width).toBe(
      width,
    );
    await navigation.getByRole("button", { name: "More to watch" }).click();
    const trending = page.getByRole("region", {
      name: "Trending this week",
      exact: true,
    });
    await expect(trending).toBeInViewport();
    const viewport = trending.locator(".landing-trending-viewport");
    await expect(
      trending.getByRole("link", { name: "Trending Movie", exact: true }),
    ).toHaveCount(1);
    const start = await viewport.evaluate((el) => el.scrollLeft);
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollLeft))
      .toBeLessThan(start - 2);
    const before = await viewport.evaluate((el) => el.scrollLeft);
    await trending
      .getByRole("button", { name: "Previous Trending this week" })
      .click();
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollLeft))
      .toBeLessThan(before - 30);
    const afterPrevious = await viewport.evaluate((el) => el.scrollLeft);
    await trending
      .getByRole("button", { name: "Next Trending this week" })
      .click();
    await expect
      .poll(() => viewport.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(afterPrevious + 30);
    const special = page.getByRole("region", {
      name: "Anime & K-dramas",
      exact: true,
    });
    await expect(
      special.getByRole("link", { name: "Trending Anime", exact: true }),
    ).toHaveCount(1);
    await expect(
      special.getByRole("link", { name: "Trending K-drama", exact: true }),
    ).toHaveCount(1);
    await expect(
      special.getByRole("link", { name: "Not drama", exact: true }),
    ).toHaveCount(0);
    await special.scrollIntoViewIfNeeded();
    const secondViewport = special.locator(".landing-trending-viewport");
    const secondStart = await secondViewport.evaluate((el) => el.scrollLeft);
    await expect
      .poll(() => secondViewport.evaluate((el) => el.scrollLeft))
      .toBeGreaterThan(secondStart + 2);
    await page.locator(".landing-bottom").scrollIntoViewIfNeeded();
    await expect(page.locator(".landing-watch-bar")).toHaveClass(/is-docked/);
    await expect(page.locator(".landing-watch-bar")).toHaveCSS(
      "position",
      "relative",
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await navigation.getByRole("button", { name: "Trailers" }).click();
    await expect(page.locator(".landing-hero")).toBeInViewport();
    await page.getByRole("button", { name: "Enable trailer sound" }).click();
    await expect(
      page.getByRole("button", { name: "Mute trailer sound" }),
    ).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`landing-${width}.png`),
      fullPage: true,
    });
    const popupPromise = page.waitForEvent("popup");
    await page
      .getByRole("link", { name: "Open RainFlix on web", exact: true })
      .click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/#\/home$/);
    await popup.close();
  });

test("trailer background fades to fixed artwork and rejects foreign events", async ({
  page,
  baseURL,
}) => {
  await landingFixture(page, baseURL);
  await page.clock.install();
  await page.goto("/");
  await expect(page.locator(".landing-ambient-video")).toHaveClass(
    /is-playing/,
  );
  await page.clock.fastForward(23000);
  await expect(page.locator(".landing-ambient-video")).not.toHaveClass(
    /is-playing/,
  );
  await expect(page.locator(".landing-movie-backdrop")).toHaveCSS(
    "position",
    "fixed",
  );
  await page.evaluate(() =>
    dispatchEvent(
      new MessageEvent("message", {
        origin: "https://example.com",
        data: JSON.stringify({ event: "onError" }),
      }),
    ),
  );
  await expect(
    page.getByText("Trailer unavailable", { exact: true }),
  ).toHaveCount(0);
});

test("missing trailers retain artwork, details and downloads", async ({
  page,
  baseURL,
}) => {
  await landingFixture(page, baseURL, false);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Trending Movie", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Featured this week", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".landing-trailer-frame iframe")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Download RainFlix", exact: true }),
  ).toBeVisible();
});
