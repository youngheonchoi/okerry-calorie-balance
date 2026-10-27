import { expect, test, type Locator } from "@playwright/test";
import { exercise, fixture } from "../fixtures";
import { stamp } from "../../src/domain/model";

async function expectNoAutomaticSelection(dialog: Locator) {
  await expect(dialog).toBeVisible();
  const state = await dialog.evaluate((element) => ({
    childFocused:
      document.activeElement !== element &&
      element.contains(document.activeElement),
    inertLeftBehind: !!element.querySelector("[inert]"),
    scrollTop: element.scrollTop,
  }));
  expect(state.childFocused).toBe(false);
  expect(state.inertLeftBehind).toBe(false);
  expect(state.scrollTop).toBe(0);
}

test("record and calendar add/edit dialogs wait for the user's selection", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  const wallet = fixture();
  wallet.meals = [
    {
      ...stamp(),
      date: "2026-10-27",
      type: "breakfast",
      name: "기존 식단",
      calories: 100,
      quantity: 1,
      memo: "",
    },
  ];
  wallet.exercises = [exercise({ date: "2026-10-27", source: "extra" })];
  await page.addInitScript((saved) => {
    for (const [field, data] of Object.entries(saved)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, wallet);
  await page.goto("/");
  await page.getByRole("button", { name: "기록", exact: true }).click();
  const mealDialog = page.getByRole("dialog", {
    name: "음식 기록",
    exact: true,
  });
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await expectNoAutomaticSelection(mealDialog);
  await page.keyboard.press("Tab");
  expect(
    await mealDialog.evaluate((dialog) =>
      dialog.contains(document.activeElement),
    ),
  ).toBe(true);
  await mealDialog
    .getByLabel("음식 이름", { exact: true })
    .fill("직접 선택한 입력");
  await expect(
    mealDialog.getByLabel("음식 이름", { exact: true }),
  ).toBeFocused();
  await mealDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .locator("#meal-breakfast")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await expectNoAutomaticSelection(mealDialog);
  await mealDialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "운동", exact: true }).click();
  const exerciseDialog = page.getByRole("dialog", {
    name: "운동 기록",
    exact: true,
  });
  for (const action of ["운동 기록 추가", "수정"]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    await expectNoAutomaticSelection(exerciseDialog);
    await exerciseDialog
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  }
  await page.getByRole("button", { name: "달력", exact: true }).click();
  for (const kind of ["식단", "운동"]) {
    await page
      .getByRole("button", { name: `${kind} 기록 수정`, exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: `2026-10-27 ${kind} 기록`,
      exact: true,
    });
    await expectNoAutomaticSelection(editor);
    for (const action of [
      kind === "식단" ? "아침 추가" : "운동 기록 추가",
      "수정",
    ]) {
      await editor.getByRole("button", { name: action, exact: true }).click();
      const form = kind === "식단" ? mealDialog : exerciseDialog;
      await expectNoAutomaticSelection(form);
      await form.getByRole("button", { name: "닫기", exact: true }).click();
    }
    await editor.getByRole("button", { name: "닫기", exact: true }).click();
  }
});

test("My help, goal, cycle and keyword dialogs open without focusing content", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  await page.addInitScript((saved) => {
    for (const [field, data] of Object.entries(saved)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, fixture());
  await page.goto("/");
  await page.getByRole("button", { name: "마이", exact: true }).click();
  for (const [action, title] of [
    ["칼로리 레벨 안내", "칼로리 레벨 안내"],
    ["목표 재설정", "목표 재설정"],
    ["관리 주기 변경", "관리 주기 변경"],
    ["키워드 관리", "식단 키워드 관리"],
  ]) {
    await page.getByRole("button", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: title, exact: true });
    await expectNoAutomaticSelection(dialog);
    await expect(
      dialog.getByRole("heading", { name: title, exact: true }),
    ).toBeInViewport();
    await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  }
});
