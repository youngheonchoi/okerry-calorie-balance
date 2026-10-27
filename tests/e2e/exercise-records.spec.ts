import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";

test("exercise records use compact rows and horizontal modal actions", async ({
  page,
}) => {
  await page.addInitScript((wallet) => {
    if (localStorage.getItem("__ait_storage:calorie_wallet_profile")) return;
    for (const [field, data] of Object.entries(wallet)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, fixture());
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await expect(page.locator(".exercise-record-section.card")).toHaveCount(0);
  await page
    .getByRole("button", { name: "운동 기록 추가", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const close = dialog.getByRole("button", { name: "닫기", exact: true });
  const save = dialog.getByRole("button", { name: "저장하기", exact: true });
  const closeBox = (await close.boundingBox())!;
  const saveBox = (await save.boundingBox())!;
  expect(closeBox.x).toBeLessThan(saveBox.x);
  expect(closeBox.y).toBe(saveBox.y);
  expect(closeBox.height).toBe(44);
  await page.getByLabel("운동 종류", { exact: true }).selectOption("running");
  await expect(page.getByLabel("추가 소비량 직접 입력 (kcal, 선택)", { exact: true })).toHaveCount(0);
  await save.click();
  const row = page.locator(".exercise-record-row");
  await expect(row.getByText("러닝", { exact: true })).toBeVisible();
  await expect(row.getByText("30분", { exact: true })).toBeVisible();
  await expect(row.getByText("276 kcal", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await row.evaluate((el) => getComputedStyle(el).borderBottomWidth),
  ).toBe("0px");
  await page.screenshot({ path: "test-results/exercise-record-row.png" });
  await row.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("운동 시간 (분)", { exact: true }).fill("45");
  await save.click();
  await expect(row.getByText("45분", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "삭제", exact: true }).click();
  await dialog.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(row).toHaveCount(0);
  await expect(
    page.getByText("운동한 내역을 기록해보세요.", { exact: true }),
  ).toBeVisible();
});
