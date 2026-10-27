import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";
import { localDate } from "../../src/domain/calculations";
import { stamp } from "../../src/domain/model";

test("direct step input starts at 5000, adjusts by 500, saves and restores exact steps", async ({
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
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "걸음 수 직접 입력", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".activity-level")).toHaveCount(5);
  const input = page.getByLabel("일상 걸음 수 (보)", { exact: true });
  await expect(input).toHaveValue("5000");
  const readRecords = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("__ait_storage:calorie_wallet_meta")!)
          .data.activityRecords,
    );
  expect(await readRecords()).toHaveLength(0);
  await page
    .getByRole("button", { name: "걸음 수 500보 줄이기", exact: true })
    .click();
  await expect(input).toHaveValue("4500");
  await page
    .getByRole("button", { name: "걸음 수 500보 늘리기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "걸음 수 500보 늘리기", exact: true })
    .click();
  await expect(input).toHaveValue("5500");
  await page.screenshot({ path: "test-results/activity-exact-steps.png" });
  await page.getByRole("button", { name: "기록하기", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(await readRecords()).toMatchObject([
    { movement: "stepsExact", steps: 5500 },
  ]);
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(page.locator(".activity-steps-form.selected")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(input).toHaveValue("5500");
  await expect(page.locator(".activity-steps-form.selected")).toHaveCount(1);
  await page.getByRole("button", { name: "달력", exact: true }).click();
  await expect(page.getByText("5,500걸음", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await input.fill("0");
  await expect(
    page.getByRole("button", { name: "걸음 수 500보 줄이기", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "기록하기", exact: true }).click();
  await expect(page.getByRole("status")).toBeVisible();
  expect(await readRecords()).toMatchObject([
    { movement: "stepsExact", steps: 0 },
  ]);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: /^조금 움직였어요/ }).click();
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(1);
  expect(await readRecords()).toMatchObject([
    { movement: "steps3000to6000", steps: null },
  ]);
  await expect(page.locator(".activity-steps-form.selected")).toHaveCount(0);
  await page
    .getByRole("button", { name: "걸음 수 500보 늘리기", exact: true })
    .click();
  await page.getByRole("button", { name: "기록하기", exact: true }).click();
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(page.locator(".activity-steps-form.selected")).toHaveCount(1);
  expect(await readRecords()).toMatchObject([
    { movement: "stepsExact", steps: 500 },
  ]);
});

test("five activity cards start unselected and persist the chosen band", async ({
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
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "오늘은 얼마나 움직였나요?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("운동을 제외하고, 오늘의 일상 활동량을 선택해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".activity-level")).toHaveCount(5);
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(0);
  await expect(page.locator(".activity-level-name")).toHaveText([
    "거의 움직이지 않았어요",
    "조금 움직였어요",
    "보통으로 움직였어요",
    "많이 움직였어요",
    "매우 많이 움직였어요",
  ]);
  await expect(page.locator(".activity-level-example")).toHaveText([
    "대부분 앉아서 생활",
    "가벼운 외출이나 짧은 이동",
    "출퇴근과 일상적인 걷기",
    "외출이 많거나 오래 걸은 날",
    "하루 중 상당 시간을 걸은 날",
  ]);
  await expect(page.locator(".activity-level-steps")).toHaveText([
    "3,000보 미만",
    "3,000~6,000보 미만",
    "6,000~9,000보 미만",
    "9,000~12,000보 미만",
    "12,000보 이상",
  ]);
  await expect(
    page.getByText("걸음 수는 참고용이에요. 정확히 몰라도 괜찮아요.", {
      exact: true,
    }),
  ).toBeAttached();
  await page.screenshot({
    path: "test-results/activity-five-levels.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /^매우 많이 움직였어요/ }).click();
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(1);
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__ait_storage:calorie_wallet_meta")!)
        .data.activityRecords,
  );
  expect(saved).toHaveLength(1);
  expect(saved[0].movement).toBe("steps12000plus");
  await page.getByRole("button", { name: "달력", exact: true }).click();
  await expect(page.locator(".calendar-activity-name")).toHaveText(
    "매우 많이 움직였어요",
  );
  await expect(page.locator(".calendar-activity-example")).toHaveCount(0);
  await expect(page.getByText("12,000보 이상", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^매우 많이 움직였어요/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: /^조금 움직였어요/ }).click();
  await expect(
    page.locator('.activity-level[aria-pressed="true"]'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /^조금 움직였어요/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a saved six-band activity remains selected without recalculating its historical band", async ({
  page,
}) => {
  const wallet = fixture();
  wallet.meta.activityRecords = [
    {
      ...stamp(),
      date: localDate(),
      steps: null,
      movement: "steps15000plus",
    },
  ];
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
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^매우 많이 움직였어요/ }),
  ).toHaveAttribute("aria-pressed", "true");
  const movement = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("__ait_storage:calorie_wallet_meta")!)
        .data.activityRecords[0].movement,
  );
  expect(movement).toBe("steps15000plus");
  await page.getByRole("button", { name: "달력", exact: true }).click();
  await expect(page.locator(".calendar-activity-name")).toHaveText(
    "매우 많이 움직였어요",
  );
  await expect(page.getByText("12,000보 이상", { exact: true })).toBeVisible();
});
