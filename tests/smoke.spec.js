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
    page.getByRole("link", { name: "Movies", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main")).toBeVisible();

  await page.getByRole("link", { name: "Movies", exact: true }).click();
  await expect(page).toHaveURL(/#\/movies$/);
  await expect(
    page.getByRole("link", { name: "Movies", exact: true }),
  ).toHaveClass(/is-active/);
});

test("supports dedicated search URLs and filters", async ({ page }) => {
  await page.goto("/#/search?q=batman");

  await expect(
    page.getByRole("heading", { name: "Search RainFlix" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Type" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Genre" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Year" })).toBeVisible();
  await expect(page).toHaveTitle(/Search: batman/);
});

test("saves a title locally and shows it in My List", async ({ page }) => {
  await page.goto("/#/home");

  const detailsButton = page
    .getByRole("button", { name: /^More information about / })
    .first();
  await expect(detailsButton).toBeVisible({ timeout: 15000 });
  const accessibleName = await detailsButton.getAttribute("aria-label");
  const title = accessibleName.replace(/^More information about /, "");
  await detailsButton.click();

  const dialog = page.getByRole("dialog");
  const saveButton = dialog.getByRole("button", {
    name: "My List",
    exact: true,
  });
  await expect(saveButton).toBeVisible({ timeout: 15000 });
  await saveButton.click();
  await expect(
    dialog.getByRole("button", { name: "In My List", exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close title details" }).click();

  await page.getByRole("link", { name: "My List", exact: true }).click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
});

test("opens a route-backed preview and browser Back closes it", async ({
  page,
}) => {
  await page.goto("/#/home");

  const detailsButton = page
    .getByRole("button", { name: /^More information about / })
    .first();
  await expect(detailsButton).toBeVisible({ timeout: 15000 });
  await detailsButton.click();

  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(/preview=/);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).not.toHaveURL(/preview=/);

  await page.goto("/#/search?q=batman");
  await expect(page).toHaveTitle(/Search: batman/);
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
