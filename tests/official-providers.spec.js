import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer } from "./helpers/playback.js";

const viewingLink = "https://www.themoviedb.org/movie/505/watch?locale=US";
const netflix = {
  provider_id: 8,
  provider_name: "Netflix",
  display_priority: 1,
  logo_path: "/netflix.png",
};

for (const type of ["movie", "tv"]) {
  test(`official ${type} services work without streaming add-ons`, async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({
      width: type === "movie" ? 390 : 1440,
      height: 900,
    });
    await mockPlayback({ page, baseURL }, false, true);
    let country = "US";
    await page.route("https://api.country.is/", (route) =>
      route.fulfill({ json: { country } }),
    );
    await page.route(
      `https://api.themoviedb.org/3/${type}/505/watch/providers?*`,
      (route) =>
        route.fulfill({
          json: {
            results: {
              US: {
                link: viewingLink.replace("/movie/", `/${type}/`),
                flatrate: [netflix],
                buy: [netflix],
              },
              PH: {
                link: `https://www.themoviedb.org/${type}/505/watch?locale=PH`,
                flatrate: [
                  {
                    provider_id: 283,
                    provider_name: "Crunchyroll",
                    logo_path: "/crunchyroll.png",
                  },
                ],
              },
            },
          },
        }),
    );
    await openPlayer(page, type);
    if (type === "tv")
      await page.locator('[data-video-id][aria-pressed="true"]').click();
    const services = page.getByRole("region", {
      name: "Streams",
      exact: true,
    });
    await expect(services).toBeVisible();
    await expect(services.getByRole("combobox")).toHaveCount(0);
    const provider = services.getByRole("link", { name: /^Netflix:/ });
    await expect(provider).toHaveCount(1);
    await expect(provider).toHaveAttribute(
      "href",
      viewingLink.replace("/movie/", `/${type}/`),
    );
    await expect(provider).toHaveAttribute("target", "_blank");
    await expect(provider).toContainText("Subscription");
    await expect(provider).toContainText("Buy");
    await expect(
      services.getByRole("link", { name: "JustWatch", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#fullscreenPlayback")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("rainflix:recently-viewed:v1") || "[]"),
      ),
    ).toEqual([]);
    country = "PH";
    await page.reload();
    if (type === "tv")
      await page.locator('[data-video-id][aria-pressed="true"]').click();
    await expect(services).toContainText("Philippines");
    await expect(provider).toHaveCount(0);
    await expect(services.getByRole("combobox")).toHaveCount(0);
    await expect(
      services.getByRole("link", { name: /^Crunchyroll:/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("blocked country detection falls back to the device locale, not a fixed country", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "languages", { value: ["en-GB"] });
  });
  await page.route("https://api.country.is/", (route) => route.abort());
  await page.route(
    "https://api.themoviedb.org/3/movie/505/watch/providers?*",
    (route) =>
      route.fulfill({
        json: { results: { GB: { link: viewingLink, flatrate: [netflix] } } },
      }),
  );
  await openPlayer(page);
  const services = page.getByRole("region", {
    name: "Streams",
    exact: true,
  });
  await expect(services).toContainText("United Kingdom");
  await expect(services.getByRole("link", { name: /^Netflix:/ })).toBeVisible();
  await expect(services.getByRole("combobox")).toHaveCount(0);
});

test("availability errors can retry and empty countries never invent services", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  let fail = true;
  await page.route(
    "https://api.themoviedb.org/3/movie/505/watch/providers?*",
    (route) =>
      fail
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { results: {} } }),
  );
  await openPlayer(page);
  const services = page.getByRole("region", {
    name: "Streams",
    exact: true,
  });
  await expect(services).toContainText("Availability unavailable.");
  fail = false;
  await services
    .getByRole("button", { name: "Retry official availability" })
    .click();
  await expect(services).toContainText("No official availability listed");
  await expect(services.getByRole("link", { name: /^Netflix:/ })).toHaveCount(
    0,
  );
});

test("official services precede add-ons in the same scrolling Streams list", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL });
  await page.route(
    "https://api.themoviedb.org/3/movie/505/watch/providers?*",
    (route) =>
      route.fulfill({
        json: { results: { US: { link: viewingLink, flatrate: [netflix] } } },
      }),
  );
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "Sample", url: `${baseURL}/__media__/player-sample.mp4` },
        ],
      },
    }),
  );
  await openPlayer(page);
  const streams = page.getByRole("region", { name: "Streams", exact: true });
  const official = streams.getByRole("link", { name: /^Netflix:/ });
  const addon = streams.getByRole("button", { name: "Play with Yastream" });
  await expect(official).toBeVisible();
  await expect(addon).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Official services", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Official services", exact: true }),
  ).toHaveCount(0);
  expect(
    await official.evaluate((node) => {
      const panel = node.closest("[data-source-list]");
      const addon = panel?.querySelector('[aria-label="Play with Yastream"]');
      return (
        !!addon &&
        !!(
          node.compareDocumentPosition(addon) & Node.DOCUMENT_POSITION_FOLLOWING
        )
      );
    }),
  ).toBe(true);
});

test("official offers merge per provider and reject untrusted destinations", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await openPlayer(page);
  const result = await page.evaluate(
    async ({ viewingLink, netflix }) => {
      const { officialProviders } =
        await import("/src/lib/official-providers.js");
      return {
        valid: officialProviders(
          {
            US: {
              link: viewingLink,
              flatrate: [netflix, netflix],
              rent: [netflix],
              buy: "invalid",
            },
          },
          "US",
        ),
        malicious: officialProviders(
          { US: { link: "javascript:alert(1)", flatrate: [netflix] } },
          "US",
        ),
        unrelated: officialProviders(
          { US: { link: "https://evil.example/", flatrate: [netflix] } },
          "US",
        ),
        empty: officialProviders({}, "PH"),
      };
    },
    { viewingLink, netflix },
  );
  expect(result.valid).toHaveLength(1);
  expect(result.valid[0].offers).toEqual(["Subscription", "Rent"]);
  expect(result.malicious).toEqual([]);
  expect(result.unrelated).toEqual([]);
  expect(result.empty).toEqual([]);
});
