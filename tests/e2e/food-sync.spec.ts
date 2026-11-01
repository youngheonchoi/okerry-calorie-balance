import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test("a failed health request never blocks local food saving or shows a remote error", async ({
  page,
}) => {
  await page.addInitScript((wallet) => {
    for (const [field, data] of Object.entries(wallet)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, fixture());
  await page.route("**/api/calories", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "UNAVAILABLE" },
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    }),
  );
  let attemptedFoodPosts = 0;
  await page.route(
    "https://okerry-calorie-balance-api.vercel.app/api/health",
    (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        headers: { "Access-Control-Allow-Origin": "*" },
        body: '{"status":"unavailable"}',
      }),
  );
  await page.route(
    "https://okerry-calorie-balance-api.vercel.app/api/foods",
    (route) => {
      attemptedFoodPosts++;
      return route.abort();
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("Apple");
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("95");
  await page.getByRole("button", { name: "개수 늘리기", exact: true }).click();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "음식 기록" })).toHaveCount(0);
  await expect(
    page.locator("#meal-breakfast").getByText("Apple", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#meal-breakfast").getByText("190 kcal", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem(
          "__ait_storage:calorie_wallet_food_sync_errors",
        );
        return raw ? JSON.parse(raw).length : 0;
      }),
    )
    .toBe(1);
  expect(attemptedFoodPosts).toBe(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
