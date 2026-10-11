import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.removeItem("rainflix:my-list:v1");
    window.localStorage.removeItem("rainflix:recently-viewed:v1");
  });
});

test("loads the catalog and keeps primary navigation usable", async ({
  page,
}) => {
  await page.goto("/#/home");

  await expect(
    page.getByRole("link", { name: "RainFlix home" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Browse", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();
  const carousel = page.getByRole("region", { name: "Featured titles" });
  await expect(carousel.getByRole("link", { name: "Watch now" })).toBeVisible();
  await expect(carousel.getByRole("button", { name: "More info" })).toHaveCount(
    0,
  );

  await page.getByRole("link", { name: "Browse", exact: true }).click();
  await expect(page).toHaveURL(/#\/browse$/);
  await expect(
    page.getByRole("link", { name: "Browse", exact: true }),
  ).toHaveClass(/is-active/);
});

test("search results show a search bar without catalog filters", async ({
  page,
}) => {
  await page.goto("/#/search?q=batman");

  await expect(page.getByRole("search")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Search RainFlix" }),
  ).toHaveCount(0);
  await expect(page).toHaveTitle(/Search: batman/);
});

test("browses with combined filters without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const discoverRequests = [];

  await page.route("https://api.themoviedb.org/3/**", async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes("/discover/")) {
      discoverRequests.push(url.toString());
    }

    await route.fulfill({
      json: url.pathname.endsWith("/discover/movie")
        ? {
            page: 1,
            results: [
              {
                id: 505,
                title: "Filtered Movie",
                release_date: "2024-05-10",
                vote_average: 8.2,
                genre_ids: [18],
                poster_path: "/filtered-movie.jpg",
                backdrop_path: "/filtered-movie-wide.jpg",
                overview: "A movie returned by the combined browse filters.",
              },
            ],
            total_pages: 1,
          }
        : { page: 1, results: [], total_pages: 1 },
    });
  });

  await page.goto("/#/browse?type=movie&genre=drama&year=2024");

  await expect(
    page.getByRole("heading", { name: "Browse 2024 Drama movies" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".catalog-card-details h3")
      .filter({ hasText: "Filtered Movie" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Type" })).toHaveValue(
    "movie",
  );
  await expect(page.getByRole("combobox", { name: "Genre" })).toHaveValue(
    "drama",
  );
  await expect(page.getByRole("combobox", { name: "Year" })).toHaveValue(
    "2024",
  );

  await expect.poll(() => discoverRequests.length).toBeGreaterThan(0);
  const movieRequest = new URL(
    discoverRequests.find((request) =>
      new URL(request).pathname.endsWith("/discover/movie"),
    ),
  );
  expect(movieRequest.searchParams.get("with_genres")).toBe("18");
  expect(movieRequest.searchParams.get("primary_release_date.gte")).toBe(
    "2024-01-01",
  );
  expect(movieRequest.searchParams.get("primary_release_date.lte")).toBe(
    "2024-12-31",
  );
  expect(
    discoverRequests.some((request) =>
      new URL(request).pathname.endsWith("/discover/tv"),
    ),
  ).toBe(false);

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(1);

  await expect(page.getByRole("search")).toHaveCount(0);
  const searchForm = await page
    .getByLabel("Browse catalog", { exact: true })
    .locator("form")
    .boundingBox();
  expect(searchForm).not.toBeNull();
  expect(
    Math.abs(
      searchForm.x +
        searchForm.width / 2 -
        (await page.evaluate(() => window.innerWidth / 2)),
    ),
  ).toBeLessThanOrEqual(1);
});

test("searches people and production companies and links them from details", async ({
  page,
}) => {
  const movie = {
    id: 101,
    media_type: "movie",
    title: "Actor Movie",
    release_date: "2024-01-01",
    vote_average: 8,
    popularity: 50,
    poster_path: "/actor-movie.jpg",
    backdrop_path: "/actor-movie-wide.jpg",
    overview: "A movie connected to the selected person.",
  };
  const series = {
    id: 202,
    media_type: "tv",
    name: "Actor Series",
    first_air_date: "2023-01-01",
    vote_average: 7.5,
    popularity: 40,
    poster_path: "/actor-series.jpg",
    backdrop_path: "/actor-series-wide.jpg",
    overview: "A series connected to the selected person.",
  };

  await page.route("https://api.themoviedb.org/3/**", async (route) => {
    const url = new URL(route.request().url());
    const query = (url.searchParams.get("query") || "").toLowerCase();
    let body = { results: [] };

    if (url.pathname.endsWith("/search/multi")) {
      body =
        query === "a24"
          ? { results: [] }
          : query === "zendaya"
            ? {
                results: [
                  {
                    id: 20,
                    media_type: "person",
                    name: "Zendaya",
                    popularity: 100,
                    known_for: [movie],
                  },
                ],
              }
            : { results: [movie] };
    } else if (url.pathname.endsWith("/search/company")) {
      body =
        query === "a24"
          ? { results: [{ id: 41077, name: "A24", popularity: 100 }] }
          : { results: [] };
    } else if (url.pathname.endsWith("/person/20")) {
      body = {
        id: 20,
        name: "Zendaya",
        combined_credits: { cast: [movie, series] },
      };
    } else if (url.pathname.endsWith("/discover/movie")) {
      body = url.searchParams.get("with_companies")
        ? { results: [{ ...movie, title: "Studio Movie" }] }
        : { results: [] };
    } else if (url.pathname.endsWith("/discover/tv")) {
      body = url.searchParams.get("with_companies")
        ? { results: [{ ...series, name: "Studio Series" }] }
        : { results: [] };
    } else if (url.pathname.endsWith("/movie/101")) {
      body = {
        ...movie,
        genres: [{ id: 18, name: "Drama" }],
        images: { logos: [] },
        credits: {
          cast: [
            {
              id: 20,
              name: "Zendaya",
              character: "Lead",
              profile_path: "/zendaya.jpg",
            },
          ],
        },
        production_companies: [{ id: 41077, name: "A24" }],
        videos: { results: [] },
      };
    }

    await route.fulfill({ json: body });
  });

  await page.goto("/#/search?q=Zendaya");
  await expect(
    page.getByText("Actor Movie", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Actor Series", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });

  const searchInput = page.locator("#catalogSearch");
  await searchInput.fill("A24");
  await expect(searchInput).toHaveValue("A24");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/q=A24/);
  await expect(
    page.getByText("Studio Movie", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Studio Series", { exact: true }).first(),
  ).toBeVisible();

  await searchInput.fill("sample");
  await searchInput.press("Enter");
  await expect(page).toHaveURL(/q=sample/);
  await page
    .getByRole("link", { name: "More information about Actor Movie" })
    .click();
  const dialog = page.getByRole("region", {
    name: "Title details",
    exact: true,
  });
  const actorLink = dialog.getByRole("link", {
    name: "View movies and series featuring Zendaya",
  });
  await expect(actorLink).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "View movies and series from A24" }),
  ).toBeVisible();
  await actorLink.click();
  await expect(page).toHaveURL(/person=20/);
  await expect(
    page.getByRole("heading", { name: "Movies and series with Zendaya" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/title\/movie\/101$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/search\?q=sample$/);

  await page
    .getByRole("link", { name: "More information about Actor Movie" })
    .click();
  await page
    .getByRole("region", { name: "Title details", exact: true })
    .getByRole("link", { name: "Browse Drama movies and series" })
    .click();
  await expect(page).toHaveURL(/#\/browse\?genre=drama$/);
  await expect(
    page.getByRole("heading", { name: "Browse Drama movies and series" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/title\/movie\/101$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/search\?q=sample$/);

  await page
    .getByRole("link", { name: "More information about Actor Movie" })
    .click();
  await page
    .getByRole("region", { name: "Title details", exact: true })
    .getByRole("link", { name: "View movies and series from A24" })
    .click();
  await expect(page).toHaveURL(/company=41077/);
  await expect(
    page.getByRole("heading", { name: "Movies and series from A24" }),
  ).toBeVisible();
  await expect(
    page.getByText("Studio Movie", { exact: true }).first(),
  ).toBeVisible();
});

test("saves a title locally and shows it in My List", async ({ page }) => {
  await page.goto("/#/home");

  const detailsButton = page
    .getByRole("link", { name: /^More information about / })
    .first();
  await expect(detailsButton).toBeVisible({ timeout: 15000 });
  const accessibleName = await detailsButton.getAttribute("aria-label");
  const title = accessibleName.replace(/^More information about /, "");
  await detailsButton.click();

  const dialog = page.getByRole("region", {
    name: "Title details",
    exact: true,
  });
  const saveButton = dialog.getByRole("button", {
    name: "My List",
    exact: true,
  });
  await expect(saveButton).toBeVisible({ timeout: 15000 });
  await saveButton.click();
  await expect(
    dialog.getByRole("button", { name: "In My List", exact: true }),
  ).toBeVisible();
  await page.goBack();

  await page.getByRole("link", { name: "My List", exact: true }).click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("opens a title page instead of a preview and browser Back returns to the catalog", async ({
  page,
}) => {
  await page.goto("/#/home");

  const detailsButton = page
    .getByRole("link", { name: /^More information about / })
    .first();
  await expect(detailsButton).toBeVisible({ timeout: 15000 });
  await detailsButton.click();

  await expect(
    page.getByRole("region", { name: "Title details", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/title\//);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Title details", exact: true }),
  ).toBeHidden();
  await expect(page).not.toHaveURL(/preview=/);

  await page.goto("/#/search?q=batman");
  await expect(page).toHaveTitle(/Search: batman/);
});

test("shares one ordered message linking to the title page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__rainflixSharedData = null;
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data) => {
        window.__rainflixSharedData = data;
      },
    });
  });
  await page.goto("/#/home");

  const detailsButton = page
    .getByRole("link", { name: /^More information about / })
    .first();
  await expect(detailsButton).toBeVisible({ timeout: 15000 });
  const accessibleName = await detailsButton.getAttribute("aria-label");
  const title = accessibleName.replace(/^More information about /, "");
  await detailsButton.click();

  const dialog = page.getByRole("region", {
    name: "Title details",
    exact: true,
  });
  const synopsis = (await dialog.locator("#titleSynopsis").innerText()).trim();
  await dialog.getByRole("button", { name: "Share" }).click();
  await expect(dialog.getByText("Shared", { exact: true })).toBeVisible();

  const shareData = await page.evaluate(() => window.__rainflixSharedData);
  expect(Object.keys(shareData)).toEqual(["text"]);
  expect(shareData.text.startsWith(`${title}\n\n${synopsis}\n\n`)).toBe(true);
  expect(shareData.text.split(synopsis)).toHaveLength(2);

  const sharedUrl = new URL(shareData.text.split("\n\n").at(-1));
  expect(sharedUrl.hash).toMatch(/^#\/title\/(movie|tv)\/\d+(?:\?.*)?$/);
  expect(sharedUrl.href).not.toContain("preview=");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
    "content",
    sharedUrl.href,
  );
});

test("records Continue Watching only after add-on video plays", async ({
  page,
  baseURL,
}) => {
  let releaseVideo;
  const pendingVideo = new Promise((resolve) => {
    releaseVideo = resolve;
  });
  await page.route("https://playback-addon.test/**", (route) =>
    route.fulfill({
      json: route.request().url().endsWith("manifest.json")
        ? {
            id: "test.playback",
            name: "Playback fixture",
            types: ["movie", "series"],
            resources: ["stream"],
            catalogs: [],
          }
        : {
            streams: [
              { name: "Fixture", url: `${baseURL}/__continue__/sample.mp4` },
            ],
          },
    }),
  );
  await page.route("**/__continue__/sample.mp4", async (route) => {
    await pendingVideo;
    await route.fulfill({
      path: "tests/fixtures/player-sample.mp4",
      contentType: "video/mp4",
    });
  });
  await page.goto("/#/home");
  await page.evaluate(async () => {
    const { installAddon } = await import("/src/lib/addons.js");
    await installAddon("https://playback-addon.test/manifest.json");
  });

  await page
    .getByRole("link", { name: /^More information about / })
    .and(page.locator('a[href*="/title/movie/"]'))
    .first()
    .click();
  await page
    .getByRole("button", { name: "Play with Playback fixture", exact: true })
    .click();

  await expect(page.locator("#playerShell video")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            window.localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(0);

  releaseVideo();
  await expect(page.locator("#playerShell video")).toBeVisible();

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            window.localStorage.getItem("rainflix:recently-viewed:v1") || "[]",
          ).length,
      ),
    )
    .toBe(1);

  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "RainFlix home" }).first().click();
  await expect(page).toHaveURL(/#\/home$/);
  const continueHeading = page.getByRole("heading", {
    name: "Continue watching",
  });
  const trendingHeading = page.getByRole("heading", {
    name: "Trending this week",
  });
  await expect(continueHeading).toBeVisible({ timeout: 15000 });
  const pendingCatalog = page
    .locator('[data-viewport-catalog="pending"]')
    .first();
  if (await pendingCatalog.count())
    await pendingCatalog.scrollIntoViewIfNeeded();
  await expect(trendingHeading).toBeVisible();
  const continueSection = continueHeading.locator("xpath=ancestor::section[1]");
  await expect(
    continueSection.getByRole("link", { name: /^Continue watching / }).first(),
  ).toBeVisible();
  expect(
    await continueHeading.evaluate(
      (heading, trending) => {
        const section = heading.closest("section");
        return Boolean(
          section?.compareDocumentPosition(trending) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      },
      await trendingHeading.elementHandle(),
    ),
  ).toBe(true);
});

test.describe("mobile accessibility", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("isolates and traps focus inside the navigation drawer", async ({
    page,
  }) => {
    await page.goto("/#/home");
    await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
      timeout: 15000,
    });

    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBeLessThanOrEqual(1);

    await page.getByRole("button", { name: "Open navigation" }).click();
    const drawer = page.getByRole("dialog", { name: "Mobile navigation" });
    await expect(drawer).toBeVisible();
    await expect(page.locator("#app-shell")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(
      drawer.getByRole("button", { name: "Close navigation" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator("#mobileNavLayer")).not.toHaveClass(/is-open/);
    await expect(page.locator("#app-shell")).not.toHaveAttribute("aria-hidden");
    await expect(
      page.getByRole("button", { name: "Open navigation" }),
    ).toBeFocused();
  });
});
