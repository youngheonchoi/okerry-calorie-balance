import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test("meal quantities persist, edit without multiplying twice, and reuse unit calories", async ({
  page,
}) => {
  await page.addInitScript((wallet) => {
    if (localStorage.getItem("__ait_storage:calorie_wallet_profile")) return;
    for (const [field, data] of Object.entries(wallet)) {
      if (field !== "schemaVersion") {
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
      }
    }
  }, fixture());
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await expect(page.getByLabel("개수", { exact: true })).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "개수 줄이기", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("음식 이름", { exact: true }).fill("테스트 사과");
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "개수 늘리기", exact: true }).click();
  await page.getByRole("button", { name: "개수 늘리기", exact: true }).click();
  await expect(page.getByLabel("개수", { exact: true })).toHaveValue("3");
  await expect(
    page.getByRole("dialog").getByText("300 kcal", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/meal-quantity.png" });
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  const breakfast = page.locator("#meal-breakfast");
  await expect(
    breakfast.getByText("테스트 사과", { exact: true }),
  ).toBeVisible();
  await expect(breakfast.getByText("3 EA", { exact: true })).toBeVisible();
  await expect(breakfast.getByText("300 kcal", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const rowLayout = await breakfast
    .locator(".meal-record-row")
    .evaluate((row) => {
      const badge = row
        .querySelector(".meal-record-badge")!
        .getBoundingClientRect();
      const actions = row
        .querySelector(".record-actions")!
        .getBoundingClientRect();
      return {
        badgeRight: badge.right,
        actionsLeft: actions.left,
        border: getComputedStyle(row).borderBottomWidth,
      };
    });
  expect(rowLayout.badgeRight).toBeLessThanOrEqual(rowLayout.actionsLeft);
  expect(rowLayout.border).toBe("0px");
  await page.screenshot({ path: "test-results/meal-record-row.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await breakfast.getByRole("button", { name: "수정", exact: true }).click();
  await expect(page.getByLabel("칼로리 (kcal)", { exact: true })).toHaveValue(
    "100",
  );
  await expect(page.getByLabel("개수", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "개수 줄이기", exact: true }).click();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(breakfast.getByText("200 kcal", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "점심 추가", exact: true }).click();
  await page
    .getByLabel("음식 선택", { exact: true })
    .selectOption({ label: "테스트 사과 · 100 kcal" });
  await expect(page.getByLabel("개수", { exact: true })).toHaveValue("1");
  await expect(page.getByLabel("칼로리 (kcal)", { exact: true })).toHaveValue(
    "100",
  );
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  const meals = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__ait_storage:calorie_wallet_meals")!)
        .data,
  );
  expect(
    meals.map((meal: { calories: number; quantity: number }) => [
      meal.calories,
      meal.quantity,
    ]),
  ).toEqual([
    [200, 2],
    [100, 1],
  ]);
  await page.reload();
  await page
    .getByRole("button", { name: "칼로리 상세 정보 펼치기", exact: true })
    .click();
  await expect(
    page
      .locator("#home-balance-details")
      .getByText("300 kcal", { exact: true }),
  ).toBeVisible();
});
