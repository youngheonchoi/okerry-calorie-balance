import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test.beforeEach(async ({ page }) => {
  await page.addInitScript((wallet) => {
    for (const [field, data] of Object.entries(wallet))
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
  }, fixture());
  await page.route("**/api/health", (route) =>
    route.fulfill({
      status: 503,
      json: { status: "unavailable" },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
});
for (const caloriesKcal of [95, 0]) {
  test(`confirms before spending, fills ${caloriesKcal} kcal and updates the remaining badge`, async ({
    page,
  }) => {
    let remaining = 5,
      calculations = 0;
    await page.route("**/api/calories", async (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "*",
          },
        });
      const input = route.request().postDataJSON();
      const result =
        input.action === "calculate"
          ? { foodName: input.foodName, caloriesKcal, source: "ai" }
          : undefined;
      if (result) {
        calculations++;
        remaining--;
      }
      return route.fulfill({
        json: {
          status: "ok",
          remainingCount: remaining,
          reservedCount: 0,
          rewardAvailable: true,
          adGroupId: "test",
          clientErrorsRecorded: true,
          ...(result ? { result } : {}),
        },
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "기록", exact: true }).click();
    await page.getByRole("button", { name: "아침 추가", exact: true }).click();
    const auto = page.getByRole("button", { name: /자동계산/ });
    await expect(auto).toBeDisabled();
    await page.getByLabel("음식 이름", { exact: true }).fill("Apple");
    await expect(auto).toHaveAccessibleName("자동계산, 5회 남음");
    await auto.click();
    let dialog = page.getByRole("dialog", { name: "칼로리를 계산할까요?" });
    await expect(dialog.getByText("5회", { exact: true })).toBeVisible();
    const cancelBox = await dialog
      .getByRole("button", { name: "취소", exact: true })
      .boundingBox();
    const primaryBox = await dialog
      .getByRole("button", { name: "계산하기", exact: true })
      .boundingBox();
    expect(cancelBox!.x).toBeLessThan(primaryBox!.x);
    expect(Math.abs(cancelBox!.y - primaryBox!.y)).toBeLessThan(3);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    expect(calculations).toBe(0);
    await auto.click();
    dialog = page.getByRole("dialog", { name: "칼로리를 계산할까요?" });
    await dialog.getByRole("button", { name: "계산하기", exact: true }).click();
    await expect(page.getByLabel("칼로리 (kcal)", { exact: true })).toHaveValue(
      String(caloriesKcal),
    );
    await expect(auto).toHaveAccessibleName("자동계산, 4회 남음");
    expect(calculations).toBe(1);
    await expect(
      page.getByText("AI가 추정한 칼로리예요.", { exact: false }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/calorie-calculated-${caloriesKcal}.png`,
    });
  });
}
test("zero balance without an issued ad ID shows the reward explanation and gives no credit", async ({
  page,
}) => {
  await page.route("**/api/calories", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        remainingCount: 0,
        reservedCount: 0,
        rewardAvailable: false,
        adGroupId: null,
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("사과");
  await page.getByRole("button", { name: "자동계산", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "자동계산 이용하기" });
  await expect(
    dialog.getByText("광고를 끝까지 보면 칼로리 자동계산 5회가 충전돼요."),
  ).toBeVisible();
  await expect(dialog.getByRole("button", { name: "충전하기" })).toBeDisabled();
  await expect(page.locator(".meal-calorie-credit-badge")).toHaveCount(0);
  await page.screenshot({ path: "test-results/calorie-reward-pending.png" });
});

test("a lost result on the last credit remains retrievable at zero balance", async ({
  page,
}) => {
  const id = "c998c500-086a-4b14-b60c-786f2f644a5e";
  await page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "__ait_storage:calorie_wallet_pending_calculation",
        JSON.stringify({ id, foodName: "Apple" }),
      ),
    { id },
  );
  let calculations = 0;
  await page.route("**/api/calories", (route) => {
    const input = route.request().postDataJSON();
    const result =
      input?.action === "calculate"
        ? { foodName: "Apple", caloriesKcal: 95, source: "ai" }
        : undefined;
    if (result) {
      expect(input.calculationId).toBe(id);
      calculations++;
    }
    return route.fulfill({
      json: {
        status: "ok",
        remainingCount: 0,
        reservedCount: 0,
        rewardAvailable: false,
        adGroupId: null,
        ...(result ? { result } : {}),
      },
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("Apple");
  await page.getByRole("button", { name: "자동계산", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "칼로리를 계산할까요?" });
  await expect(
    dialog.getByText("이전에 요청한 계산을 다시 확인해요.", { exact: false }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "계산하기", exact: true }).click();
  await expect(page.getByLabel("칼로리 (kcal)", { exact: true })).toHaveValue(
    "95",
  );
  expect(calculations).toBe(1);
});
