import { expect, test, type Page } from "@playwright/test";
import { fixture } from "../fixtures";

async function nativeBack(page: Page) {
  await page.evaluate(() =>
    (
      window as unknown as { __ait: { trigger: (event: string) => void } }
    ).__ait.trigger("backEvent"),
  );
}
async function seed(page: Page) {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  await page.addInitScript((wallet) => {
    for (const [field, data] of Object.entries(wallet)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, fixture());
}

test("onboarding uses native back without a duplicate header or footer back action", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
    .click();
  await expect(page.locator(".onboarding header")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /이전 단계|돌아가기/ }),
  ).toHaveCount(0);
  await expect(page.locator(".intro-footer-actions button")).toHaveCount(1);
  await page.screenshot({ path: "test-results/review-onboarding.png" });
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await page.getByLabel("나이", { exact: true }).fill("35");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("2/4");
  await nativeBack(page);
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("1/4");
  await expect(page.getByLabel("나이", { exact: true })).toHaveValue("35");
  await nativeBack(page);
  await expect(
    page.getByRole("button", { name: "계산 시작하기", exact: true }),
  ).toBeVisible();
  await nativeBack(page);
  await expect(
    page.getByRole("button", {
      name: "아무 곳이나 터치해 시작하기",
      exact: true,
    }),
  ).toBeVisible();
});

test("native back closes only the top calendar dialog, then returns to home", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "달력", exact: true }).click();
  await page
    .getByRole("button", { name: "식단 기록 수정", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "2026-10-27 식단 기록",
    exact: true,
  });
  await editor.getByRole("button", { name: "아침 추가", exact: true }).click();
  const inner = page.getByRole("dialog", { name: "음식 기록", exact: true });
  await expect(inner.locator(".dialog-close")).toHaveCount(1);
  await expect(inner.locator(".meal-form-actions button")).toHaveCount(1);
  await expect(inner.locator(".dialog-close")).not.toBeFocused();
  await inner.screenshot({ path: "test-results/review-meal-dialog.png" });
  await nativeBack(page);
  await expect(inner).toHaveCount(0);
  await expect(editor).toBeVisible();
  await nativeBack(page);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator(".calendar-page")).toBeVisible();
  await nativeBack(page);
  await expect(page.locator(".balance-card")).toBeVisible();
});

test("recalculation and My dialogs use native back while keeping a modal close icon", async ({
  page,
}) => {
  await seed(page);
  await page.goto("/");
  await page.getByRole("button", { name: "마이", exact: true }).click();
  for (const action of [
    "칼로리 레벨 안내",
    "목표 재설정",
    "관리 주기 변경",
    "키워드 관리",
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator(".dialog-close")).toHaveCount(1);
    if (action === "목표 재설정")
      await dialog.screenshot({ path: "test-results/review-goal-dialog.png" });
    await expect(
      dialog.getByRole("button", { name: /이전|돌아가기/ }),
    ).toHaveCount(0);
    await nativeBack(page);
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "마이페이지", exact: true }),
    ).toBeVisible();
  }
  await page
    .getByRole("button", { name: "다시 계산하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("1/2");
  await expect(page.locator(".intro-footer-actions button")).toHaveCount(1);
  await nativeBack(page);
  await nativeBack(page);
  await expect(
    page.getByRole("heading", { name: "마이페이지", exact: true }),
  ).toBeVisible();
});
