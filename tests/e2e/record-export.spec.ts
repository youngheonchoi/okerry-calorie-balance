import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { fixture, exercise } from "../fixtures";
import { stamp } from "../../src/domain/model";
import { validateWallet } from "../../src/domain/validation";
const expectedBalance =
  Math.round((190 - 3 * fixture().tdee_history[0].rest - 300) * 100) / 100;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-09T03:00:00Z"));
  const wallet = fixture();
  wallet.meals = [
    {
      ...stamp(),
      date: "2026-10-01",
      type: "breakfast",
      name: "사과",
      calories: 190,
      quantity: 2,
      memo: "식후 간식",
    },
    {
      ...stamp(),
      date: "2026-10-08",
      type: "lunch",
      name: "기간 밖 음식",
      calories: 500,
      quantity: 1,
      memo: "",
    },
  ];
  wallet.exercises = [
    exercise({
      date: "2026-10-03",
      source: "extra",
      calories: 300,
      manualCalories: 300,
    }),
  ];
  validateWallet(wallet);
  page.setDefaultTimeout(10000);
  await page.addInitScript((wallet) => {
    for (const [field, data] of Object.entries(wallet))
      if (field !== "schemaVersion")
        localStorage.setItem(
          `__ait_storage:calorie_wallet_${field}`,
          JSON.stringify({ schemaVersion: 1, data }),
        );
  }, wallet);
  // Simulate completion/cancellation without requesting or showing any real/test ads.
  await page.route("**/src/data/rewardedAds.ts*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `
      window.__exportAdTest = { earned: true, shows: 0, loads: 0 };
      export function createRewardedAdController() {
        let disposed = false;
        return {
          supported: () => true,
          preload: async () => { window.__exportAdTest.loads++; },
          show: async (options) => {
            if (!options?.waitForDismissal) throw new Error("Must await ad closure");
            window.__exportAdTest.shows++;
            await new Promise(resolve => setTimeout(resolve, 30));
            return !disposed && window.__exportAdTest.earned;
          },
          dispose: () => { disposed = true; },
        };
      }
    `,
    }),
  );
  await page.route("**/api/ads", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        exportRewardedAdGroupId: "configured-export-group",
      },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await expect(page.locator(".my-info-card + .my-export-menu")).toBeVisible();
  await page.getByRole("button", { name: /기록 내보내기/ }).click();
  await expect(
    page.getByRole("heading", { name: "기록 내보내기", exact: true }),
  ).toBeVisible();
  await page.getByLabel("시작일", { exact: true }).fill("2026-10-01");
  await page.getByLabel("종료일", { exact: true }).fill("2026-10-03");
  await expect(
    page.getByRole("button", { name: "광고 보고 CSV 저장하기", exact: true }),
  ).toBeEnabled();
});

test("downloads the selected CSV data and full-period balance", async ({
  page,
}) => {
  await page.getByRole("checkbox", { name: /내 정보/ }).uncheck();
  await page.getByRole("checkbox", { name: /활동/ }).uncheck();
  await page.getByRole("checkbox", { name: /운동/ }).uncheck();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "광고 보고 CSV 저장하기", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    "calorie-wallet_2026-10-01_2026-10-03.csv",
  );
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain("누적 칼로리 잔고(kcal)");
  expect(csv).toContain(`"${expectedBalance}"`);
  expect(csv).toContain('"사과","2","95","190"');
  expect(csv).toContain('"2026-10-02","","미기록"');
  expect(csv).not.toContain("기간 밖 음식");
  expect(csv).not.toContain("기초대사량(kcal)");
});

test("shows and copies the prompt, updates selection, and returns to My on native back", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("radio", { name: /AI용 프롬프트/ }).check();
  await page.getByRole("checkbox", { name: /내 정보/ }).uncheck();
  await page.getByRole("checkbox", { name: /운동/ }).uncheck();
  await expect(
    page.getByLabel("AI에게 물어볼 내용", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "광고 보고 프롬프트 만들기", exact: true })
    .click();
  const text = await page
    .getByLabel("AI에게 물어볼 내용", { exact: true })
    .inputValue();
  const data = JSON.parse(text.split("[기록 데이터]\n")[1]);
  expect(Object.keys(data)).toEqual(["공통 요약", "활동", "식단"]);
  expect(data["공통 요약"]["누적 칼로리 잔고(kcal)"]).toBe(expectedBalance);
  await page
    .getByRole("button", { name: "프롬프트 복사하기", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("프롬프트를 복사했어요");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await page
    .getByRole("button", { name: "프롬프트 복사하기", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __exportAdTest: { shows: number } })
          .__exportAdTest.shows,
    ),
  ).toBe(1);
  await page.screenshot({
    path: "test-results/record-export-prompt.png",
    fullPage: true,
  });
  await page.evaluate(() =>
    (
      window as unknown as { __ait: { trigger: (event: string) => void } }
    ).__ait.trigger("backEvent"),
  );
  await expect(
    page.getByRole("heading", { name: "마이페이지", exact: true }),
  ).toBeVisible();
});

test("blocks invalid dates and keeps narrow-screen controls within the viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await page.getByLabel("시작일", { exact: true }).fill("2026-10-04");
  await expect(page.getByRole("alert")).toHaveText(
    "종료일은 시작일과 같거나 뒤여야 해요.",
  );
  await expect(
    page.getByRole("button", { name: "광고 보고 CSV 저장하기" }),
  ).toBeDisabled();
  await page.getByLabel("시작일", { exact: true }).fill("2026-10-01");
  const bounds = await page.locator(".export-date-fields").boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 750 });
    const start = await page
      .getByLabel("시작일", { exact: true })
      .boundingBox();
    const end = await page.getByLabel("종료일", { exact: true }).boundingBox();
    const options = await page.locator(".export-options").boundingBox();
    expect(start!.x).toBeCloseTo(options!.x, 0);
    expect(end!.x + end!.width).toBeCloseTo(options!.x + options!.width, 0);
    expect(start!.x + start!.width).toBeLessThanOrEqual(width);
    expect(end!.x + end!.width).toBeLessThanOrEqual(width);
    if (width <= 420) {
      expect(end!.y).toBeGreaterThan(start!.y + start!.height);
      expect(start!.width).toBeCloseTo(options!.width, 0);
      expect(end!.width).toBeCloseTo(options!.width, 0);
    } else expect(end!.y).toBe(start!.y);
    expect(
      await page
        .locator(".tab-content-scroll")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 320, height: 750 });
  await page.screenshot({
    path: "test-results/record-export-320.png",
    fullPage: true,
  });
});

test("cancelled ads reveal no prompt; changing selection locks a completed prompt again", async ({
  page,
}) => {
  await page.getByRole("radio", { name: /AI용 프롬프트/ }).check();
  await page.evaluate(() => {
    (
      window as unknown as { __exportAdTest: { earned: boolean } }
    ).__exportAdTest.earned = false;
  });
  await page
    .getByRole("button", { name: "광고 보고 프롬프트 만들기", exact: true })
    .click();
  await expect(
    page.getByText("광고를 끝까지 보면 기록을 내보낼 수 있어요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("AI에게 물어볼 내용", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    (
      window as unknown as { __exportAdTest: { earned: boolean } }
    ).__exportAdTest.earned = true;
  });
  await page
    .getByRole("button", { name: "광고 보고 프롬프트 만들기", exact: true })
    .click();
  await expect(
    page.getByLabel("AI에게 물어볼 내용", { exact: true }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: "내 정보", exact: true }).uncheck();
  await expect(
    page.getByLabel("AI에게 물어볼 내용", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "광고 보고 프롬프트 만들기",
      exact: true,
    }),
  ).toBeEnabled();
});

test("an empty server ad ID keeps export locked", async ({ page }) => {
  await page.route("**/api/ads", (route) =>
    route.fulfill({
      json: { status: "ok", exportRewardedAdGroupId: null },
      headers: { "Access-Control-Allow-Origin": "*" },
    }),
  );
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page.getByRole("button", { name: /기록 내보내기/ }).click();
  await page.getByRole("radio", { name: /AI용 프롬프트/ }).check();
  await expect(
    page.getByRole("button", { name: "광고 다시 준비하기", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "광고 다시 준비하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "광고 다시 준비하기", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("AI에게 물어볼 내용", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __exportAdTest: { shows: number } })
          .__exportAdTest.shows,
    ),
  ).toBe(0);
});
