import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";
import { stamp } from "../../src/domain/model";
import { kcal } from "../../src/domain/format";

test("calendar edits and deletes each record type on a past day without leaving the calendar", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  const wallet = fixture();
  wallet.meals = [
    {
      ...stamp(),
      date: "2026-10-27",
      type: "lunch",
      name: "오늘 기록",
      calories: 250,
      quantity: 1,
      memo: "",
    },
  ];
  await page.addInitScript((saved) => {
    if (localStorage.getItem("__ait_storage:calorie_wallet_profile")) return;
    for (const [field, data] of Object.entries(saved)) {
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
    }
  }, wallet);
  await page.goto("/");
  await page.getByRole("button", { name: "달력", exact: true }).click();
  const formatBalance = (value: number) => kcal(value).replace(" ", "");
  const base = wallet.tdee_history[0].rest;
  const initialTotal = formatBalance(250 - base);
  const summary = page.locator(".calendar-balance-summary .metric strong");
  await expect(summary).toHaveText([initialTotal]);
  await expect(
    page.getByRole("button", { name: "10월 25일, 기록 없음", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "10월 28일, 기록 없음", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "10월 26일, 기록 없음", exact: true })
    .click();
  await expect(page.locator(".calendar-record-edit")).toHaveCount(3);
  const activityEditor = page.getByRole("dialog", {
    name: "2026-10-26 활동 기록",
    exact: true,
  });
  const mealEditor = page.getByRole("dialog", {
    name: "2026-10-26 식단 기록",
    exact: true,
  });
  const exerciseEditor = page.getByRole("dialog", {
    name: "2026-10-26 운동 기록",
    exact: true,
  });

  await page
    .getByRole("button", { name: "활동 기록 수정", exact: true })
    .click();
  await activityEditor
    .getByRole("button", { name: /^많이 움직였어요/ })
    .click();
  await expect(activityEditor.getByRole("status")).toHaveText(
    "선택한 날짜의 칼로리 잔고에 반영했어요.",
  );
  await activityEditor
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(page.locator(".calendar-activity-name")).toHaveText(
    "많이 움직였어요",
  );
  await page
    .getByRole("button", { name: "활동 기록 수정", exact: true })
    .click();
  await activityEditor
    .getByLabel("일상 걸음 수 (보)", { exact: true })
    .fill("8000");
  await activityEditor
    .getByRole("button", { name: "기록하기", exact: true })
    .click();
  await expect(activityEditor.getByRole("status")).toBeVisible();
  await activityEditor
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(page.getByText("8,000걸음", { exact: true })).toBeVisible();

  await page
    .getByRole("button", { name: "식단 기록 수정", exact: true })
    .click();
  await page.screenshot({ path: "test-results/calendar-meal-editor.png" });
  await mealEditor
    .getByRole("button", { name: "아침 추가", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(mealEditor).toBeVisible();
  await mealEditor
    .getByRole("button", { name: "아침 추가", exact: true })
    .click();
  const foodForm = page.getByRole("dialog", { name: "음식 기록", exact: true });
  await foodForm.getByLabel("음식 이름", { exact: true }).fill("지난날 바나나");
  await foodForm.getByLabel("칼로리 (kcal)", { exact: true }).fill("100");
  await foodForm
    .getByRole("button", { name: "개수 늘리기", exact: true })
    .click();
  await foodForm.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(mealEditor.getByText("200 kcal", { exact: true })).toBeVisible();
  await mealEditor.getByRole("button", { name: "수정", exact: true }).click();
  await foodForm.getByLabel("칼로리 (kcal)", { exact: true }).fill("150");
  await foodForm.getByRole("button", { name: "저장하기", exact: true }).click();
  await mealEditor.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByText("300kcal", { exact: true })).toBeVisible();
  await expect(
    page.locator('.calendar-meal-group[aria-label="아침"] .calendar-meal-row'),
  ).toHaveCount(1);
  await expect(
    page.locator('.calendar-meal-group[aria-label="점심"] .empty'),
  ).toHaveText("기록이 없어요.");

  await page
    .getByRole("button", { name: "운동 기록 수정", exact: true })
    .click();
  await exerciseEditor
    .getByRole("button", { name: "운동 기록 추가", exact: true })
    .click();
  const exerciseForm = page.getByRole("dialog", {
    name: "운동 기록",
    exact: true,
  });
  await exerciseForm
    .getByLabel("운동 종류", { exact: true })
    .selectOption("hiking");
  await exerciseForm.getByLabel("운동 시간 (분)", { exact: true }).fill("60");
  await exerciseForm
    .getByRole("button", { name: "저장하기", exact: true })
    .click();
  await expect(exerciseEditor.getByText("60분", { exact: true })).toBeVisible();
  await exerciseEditor
    .getByRole("button", { name: "수정", exact: true })
    .click();
  await exerciseForm.getByLabel("운동 시간 (분)", { exact: true }).fill("45");
  await exerciseForm
    .getByRole("button", { name: "저장하기", exact: true })
    .click();
  await exerciseEditor
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(page.getByText("등산 · 45분", { exact: true })).toBeVisible();
  await expect(summary).toHaveText([
    formatBalance(250 - base + 300 - base - 44.1 - 275.625),
  ]);
  await expect(
    page.locator(".calendar-day.selected .calendar-marker"),
  ).toHaveCount(3);
  await expect(page.locator(".calendar-page > h1")).toHaveText("달력");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/calendar-record-editing.png",
    fullPage: true,
  });

  for (const type of ["식단", "운동"]) {
    await page
      .getByRole("button", { name: `${type} 기록 수정`, exact: true })
      .click();
    const editor = type === "식단" ? mealEditor : exerciseEditor;
    await editor.getByRole("button", { name: "삭제", exact: true }).click();
    await page
      .getByRole("dialog", { name: "이 기록을 삭제할까요?", exact: true })
      .getByRole("button", { name: "삭제하기", exact: true })
      .click();
    await editor.getByRole("button", { name: "닫기", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "활동 기록 수정", exact: true })
    .click();
  await activityEditor
    .getByRole("button", { name: "기록 삭제", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "활동 기록을 삭제할까요?", exact: true })
    .getByRole("button", { name: "삭제하기", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(
    page.getByText("활동 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".calendar-meal-group .empty")).toHaveCount(4);
  await expect(
    page.getByText("운동 기록이 없어요.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".calendar-day.selected .calendar-marker"),
  ).toHaveCount(0);
  await expect(page.locator(".calendar-day.selected")).toBeEnabled();
  const stored = await page.evaluate(() => ({
    meals: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_meals")!,
    ).data,
    exercises: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_exercises")!,
    ).data,
    activity: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_meta")!,
    ).data.activityRecords,
  }));
  expect(stored.meals).toMatchObject([
    { date: "2026-10-27", name: "오늘 기록", calories: 250 },
  ]);
  expect(stored.exercises).toEqual([]);
  expect(stored.activity).toEqual([]);
  await expect(summary).toHaveText([initialTotal]);
});

test("calendar enables the current cycle through today and past dates with saved records", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  const wallet = fixture();
  wallet.meta.startedOn = "2026-10-27";
  wallet.meta.activityRecords = [
    { ...stamp(), date: "2026-10-12", movement: "stepsExact", steps: 5000 },
  ];
  wallet.meals = [
    {
      ...stamp(),
      date: "2026-10-13",
      type: "lunch",
      name: "과거 식단",
      calories: 100,
      memo: "",
    },
  ];
  wallet.exercises = [
    {
      ...stamp(),
      date: "2026-10-14",
      kind: "running",
      intensity: "moderate",
      minutes: 30,
      weight: 70,
      source: "extra",
      calories: 275.625,
    },
  ];
  wallet.meta.workoutStatus = [
    { ...stamp(), date: "2026-10-15", workedOut: false },
  ];
  wallet.weights = [{ ...stamp(), date: "2026-09-30", weight: 70 }];
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
  await page.getByRole("button", { name: "달력", exact: true }).click();
  for (const day of [26, 27]) {
    await expect(
      page.getByRole("button", {
        name: `10월 ${day}일, 기록 없음`,
        exact: true,
      }),
    ).toBeEnabled();
  }
  for (const day of [28, 29, 30, 31]) {
    await expect(
      page.getByRole("button", {
        name: `10월 ${day}일, 기록 없음`,
        exact: true,
      }),
    ).toBeDisabled();
  }
  for (const day of [12, 13, 14, 15]) {
    const date = page
      .locator(".calendar-day")
      .filter({ hasText: new RegExp(`^${day}$`) });
    await expect(date).toBeEnabled();
    await date.click();
    await expect(date).toHaveAttribute("aria-pressed", "true");
  }
  await expect(
    page.getByRole("button", { name: "10월 25일, 기록 없음", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "다음 달", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "이전 달", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "9월 30일, 기록 없음", exact: true }),
  ).toBeEnabled();
});
