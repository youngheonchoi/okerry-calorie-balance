import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";
import { stamp } from "../../src/domain/model";
import { addDays, estimateDailyTDEE } from "../../src/domain/calculations";

test("personalized calorie levels survive reload and recalculate after editing", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-27T03:00:00Z"));
  const wallet = fixture();
  wallet.profile = { ...wallet.profile!, basis: "manual", manualBmr: 1500 };
  Object.assign(
    wallet.tdee_history[0],
    estimateDailyTDEE(
      wallet.profile,
      2000 - estimateDailyTDEE(wallet.profile).rest,
    ),
  );
  wallet.meals = Array.from({ length: 10 }, (_, index) => ({
    ...stamp(),
    date: addDays("2026-10-18", index),
    type: "lunch" as const,
    name: "레벨 확인 식단",
    calories: 125,
    quantity: 1,
    memo: "",
  }));
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
  await page.getByRole("button", { name: "마이", exact: true }).click();
  const card = page.locator(".calorie-level-card");
  const gauge = card.getByRole("progressbar");
  await expect(card.locator(".calorie-level-weight")).toHaveText("Lv.2");
  await expect(card.locator(".calorie-level-caption")).toHaveText(
    "환산 감량 −2.5kg",
  );
  await expect(card).toHaveClass(/calorie-tier-silver/);
  await expect(card.getByText("시작 D+26", { exact: true })).toBeVisible();
  await expect(gauge).toHaveAttribute("value", "3750");
  await expect(gauge).toHaveAttribute("max", "7500");
  await expect(card.getByText("50%", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/calorie-level-card.png",
    fullPage: true,
  });
  await card
    .getByRole("button", { name: "칼로리 레벨 안내", exact: true })
    .click();
  const modal = page.getByRole("dialog", {
    name: "칼로리 레벨 안내",
    exact: true,
  });
  await expect(
    modal.getByRole("heading", { name: "칼로리 레벨 안내", exact: true }),
  ).toBeInViewport();
  await modal.screenshot({ path: "test-results/calorie-level-help-top.png" });
  await expect(modal.getByLabel("달성 배지", { exact: true })).toHaveCount(0);
  await expect(modal).not.toContainText("× 5");
  await expect(modal).not.toContainText("7,700");
  await expect(modal.locator(".calorie-tier-guide li")).toHaveCount(6);
  await expect(modal.getByText(/주기적으로 ‘내 정보’/)).toHaveCount(1);
  await modal.screenshot({ path: "test-results/calorie-level-help.png" });
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await expect(gauge).toHaveAttribute("value", "3750");
  await page.getByRole("button", { name: "달력", exact: true }).click();
  await page
    .getByRole("button", { name: "식단 기록 수정", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "수정", exact: true })
    .click();
  const form = page.locator(".meal-record-form");
  await form.getByLabel("칼로리 (kcal)", { exact: true }).fill("3875");
  await form.getByRole("button", { name: "저장하기", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await expect(card.locator(".calorie-level-weight")).toHaveText("Lv.2");
  await expect(gauge).toHaveAttribute("value", "0");
  await expect(card.locator(".calorie-level-caption")).toHaveText(
    "환산 감량 −2kg",
  );
  await expect(card.getByText("다음 레벨 Lv.3", { exact: true })).toBeVisible();
});

test("an empty history starts at zero without awarding badges for blank days", async ({
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
  const card = page.locator(".calorie-level-card");
  await expect(card.locator(".calorie-level-weight")).toHaveText("Lv.0");
  await expect(card.getByRole("progressbar")).toHaveAttribute("value", "0");
  await card
    .getByRole("button", { name: "칼로리 레벨 안내", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "칼로리 레벨 안내", exact: true }),
  ).toBeVisible();
});

for (const [level, tier] of [
  [0, "bronze"],
  [2, "silver"],
  [4, "gold"],
  [7, "emerald"],
  [10, "diamond"],
  [15, "ruby"],
] as const) {
  test(`level ${level} displays the ${tier} trophy and gradient`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(new Date("2026-12-27T03:00:00Z"));
    const wallet = fixture();
    wallet.profile = { ...wallet.profile!, basis: "manual", manualBmr: 1500 };
    Object.assign(
      wallet.tdee_history[0],
      estimateDailyTDEE(
        wallet.profile,
        2000 - estimateDailyTDEE(wallet.profile).rest,
      ),
    );
    const deficit = (level + 0.5) * 7500;
    const count = Math.ceil(deficit / 1900);
    wallet.meals = Array.from({ length: count }, (_, index) => ({
      ...stamp(),
      date: addDays("2026-10-01", index),
      type: "lunch" as const,
      name: "등급 확인 식단",
      calories: 2000 - deficit / count,
      quantity: 1,
      memo: "",
    }));
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
    await page.getByRole("button", { name: "마이", exact: true }).click();
    const card = page.locator(".calorie-level-card");
    await expect(card).toHaveClass(new RegExp(`calorie-tier-${tier}`));
    await expect(card.locator(".calorie-level-weight")).toHaveText(
      `Lv.${level}`,
    );
    await expect(card.locator(".calorie-level-ruby-stone")).toHaveCount(
      tier === "ruby" ? 1 : 0,
    );
    if (tier === "ruby") {
      await expect(card.getByText("MAX", { exact: true })).toBeVisible();
      await expect(card.getByRole("progressbar")).toHaveAttribute(
        "value",
        "7500",
      );
      await expect(card.locator(".calorie-level-remaining")).toHaveCount(0);
    } else {
      await expect(card.getByText("MAX", { exact: true })).toHaveCount(0);
    }
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await card.screenshot({ path: `test-results/calorie-tier-${tier}.png` });
  });
}
