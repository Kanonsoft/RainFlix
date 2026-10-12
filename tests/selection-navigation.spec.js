import { expect, test } from "@playwright/test";
import { mockPlayback, openPlayer } from "./helpers/playback.js";

test.beforeEach(mockPlayback);

test("series selection follows providers, episodes, streams and Back", async ({
  page,
  baseURL,
}) => {
  await page.route("https://yastream.tamthai.de/**", (route) =>
    route.fulfill({
      json: {
        streams: [1, 2].map((n) => ({
          name: `Stream ${n}`,
          url: `${baseURL}/__media__/player-sample.mp4?source=${n}`,
        })),
      },
    }),
  );
  await openPlayer(page, "tv");
  await page
    .getByRole("button", { name: "Play with Yastream", exact: true })
    .click();
  await expect(page).toHaveURL(/selection=episodes/);
  await page.getByRole("button", { name: "2. Second", exact: true }).click();
  await expect(page).toHaveURL(/selection=streams/);
  await expect(page.locator("button[data-stream-id]")).toHaveCount(2);
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Episodes", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("button", { name: "Play with Yastream", exact: true }),
  ).toBeVisible();
});
