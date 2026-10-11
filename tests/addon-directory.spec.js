import { expect, test } from "@playwright/test";
import { mockPlayback } from "./helpers/playback.js";

test("directory browsing, filters, pagination and installation remain without a directory-site link", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  await page.setViewportSize({ width: 390, height: 844 });
  const manifest = {
    id: "browse.test",
    name: "Browse Provider",
    description: "Directory-only description",
    types: ["movie"],
    resources: ["stream"],
  };
  const queries = [];
  await page.route("https://stremio-addons.net/api/v0/**", (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/categories"))
      return route.fulfill({
        json: { categories: [{ slug: "streaming", name: "Streaming" }] },
      });
    queries.push(Object.fromEntries(url.searchParams));
    return route.fulfill({
      json: {
        addons: [
          {
            uuid: "browse-test",
            manifest,
            manifestUrl: "https://browse.example/manifest.json",
          },
        ],
        pagination: { hasNextPage: url.searchParams.get("page") === "1" },
      },
    });
  });
  let requests = 0;
  await page.route("https://browse.example/manifest.json", (route) => {
    requests++;
    return route.fulfill({ json: manifest });
  });
  await page.goto("/#/addons");
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  const directory = page.getByRole("region", {
    name: "Browse add-ons",
    exact: true,
  });
  await expect(
    directory.getByRole("heading", { name: "Browse Provider" }),
  ).toBeVisible();
  await expect(
    page.locator('a[href^="https://stremio-addons.net"]'),
  ).toHaveCount(0);
  expect(requests).toBe(0);
  await directory.getByLabel("Search add-ons").fill("Provider");
  await directory.getByLabel("Add-on category").selectOption("streaming");
  await expect
    .poll(() => queries.at(-1))
    .toMatchObject({ page: "1", search: "Provider", category: "streaming" });
  await directory.getByRole("button", { name: "Next", exact: true }).click();
  await expect(directory.getByText("Page 2", { exact: true })).toBeVisible();
  await expect.poll(() => queries.at(-1)?.page).toBe("2");
  await directory.getByRole("button", { name: "Install", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove Browse Provider" }),
  ).toBeVisible();
  expect(requests).toBe(1);
  await expect(
    page.getByRole("tab", { name: "Installed (1)" }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(directory).toBeHidden();
  await page.getByRole("tab", { name: "Browse", exact: true }).click();
  await expect(directory.getByLabel("Search add-ons")).toHaveValue("Provider");
  await expect(directory.getByText("Page 2", { exact: true })).toBeVisible();
  await expect(directory.getByText("Installed", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Directory-only description", { exact: true }),
  ).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("directory failures retry without removing installed management or manual installation", async ({
  page,
  baseURL,
}) => {
  await mockPlayback({ page, baseURL }, false);
  let fail = true;
  await page.route("https://stremio-addons.net/api/v0/addons?*", (route) =>
    fail
      ? route.fulfill({ status: 503 })
      : route.fulfill({
          json: { addons: [], pagination: { hasNextPage: false } },
        }),
  );
  await page.goto("/#/addons");
  const directory = page.getByRole("region", {
    name: "Browse add-ons",
    exact: true,
  });
  await expect(directory.getByRole("alert")).toBeVisible();
  await expect(page.locator("#appLoader")).toHaveClass(/is-hidden/, {
    timeout: 15000,
  });
  await expect(page.getByLabel("Manifest URL")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Installed (0)" })).toBeVisible();
  await page.getByRole("tab", { name: "Browse", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Installed (0)" })).toBeFocused();
  await expect(page.getByText("No add-ons installed.")).toBeVisible();
  await expect(directory).toBeHidden();
  await expect(page.getByLabel("Manifest URL")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("tab", { name: "Browse", exact: true }),
  ).toBeFocused();
  fail = false;
  await directory.getByRole("button", { name: "Retry directory" }).click();
  await expect(directory.getByText("No matching add-ons.")).toBeVisible();
});

for (const width of [390, 1440]) {
  test(`desktop navigation places My List after Year and Add-ons last at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await mockPlayback({ page, baseURL }, false);
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/src/platform/index.js", (route) =>
      route.fulfill({
        contentType: "text/javascript",
        body: "export const isDesktop=true; export const isAndroid=false; export const isNativeApp=true; export const browserTorrentAvailable=false; export function shareBaseUrl(){return location.origin;}",
      }),
    );
    await page.goto("/#/home");
    if (width < 768)
      await page.getByRole("button", { name: "Open navigation" }).click();
    const nav = page.getByRole("navigation", {
      name: width < 768 ? "Mobile primary navigation" : "Primary navigation",
      exact: true,
    });
    await expect(nav).toBeVisible();
    const labels = await nav
      .locator(":scope > a, :scope > div > button")
      .allTextContents();
    expect(labels.map((label) => label.trim())).toEqual([
      "Home",
      "Movies",
      "Series",
      "Genres",
      "Year",
      "My List",
      "Settings",
      "Add-ons",
    ]);
  });
}
