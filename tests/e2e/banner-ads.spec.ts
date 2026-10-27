import { expect, test } from "@playwright/test";
import { fixture } from "../fixtures";
import { localDate } from "../../src/domain/calculations";
import { stamp } from "../../src/domain/model";

test("one inline test banner follows each menu, cleans old slots and collapses on no fill", async ({
  page,
}) => {
  const wallet = fixture();
  wallet.meals = Array.from({ length: 30 }, (_, index) => ({
    ...stamp(),
    date: localDate(),
    type: "lunch" as const,
    name: `광고 위치 확인 ${index}`,
    calories: 100,
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
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  for (const [name, placement] of [
    ["홈", "home"],
    ["활동", "activity"],
    ["기록", "records"],
    ["달력", "calendar"],
    ["마이", "my"],
  ]) {
    await page.getByRole("button", { name, exact: true }).click();
    const banner = page.locator(
      `.inline-banner[data-placement="${placement}"]`,
    );
    await expect(banner).toHaveClass(/is-rendered/);
    await expect(
      page.locator(".inline-banner-target [data-ait-slot-id]"),
    ).toHaveCount(1);
    await banner.scrollIntoViewIfNeeded();
    await expect(banner).toBeInViewport();
    const layout = await page.evaluate(() => {
      const banner = document
        .querySelector(".inline-banner")!
        .getBoundingClientRect();
      const tabs = document
        .querySelector(".floating-tabs")!
        .getBoundingClientRect();
      return {
        bannerBottom: banner.bottom,
        tabsTop: tabs.top,
        width: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });
    expect(layout.bannerBottom).toBeLessThanOrEqual(layout.tabsTop - 16);
    expect(layout.width).toBeLessThanOrEqual(layout.viewport);
  }
  await page.screenshot({
    path: "test-results/inline-banner-my.png",
    fullPage: true,
  });
  const calls = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __ait: {
          state: { sdkCallLog: Array<{ method: string; args: unknown[] }> };
        };
      }
    ).__ait.state;
    return state.sdkCallLog.filter((call) =>
      call.method.startsWith("TossAds."),
    );
  });
  expect(
    calls.filter((call) => call.method === "TossAds.initialize"),
  ).toHaveLength(1);
  expect(
    calls
      .filter((call) => call.method === "TossAds.attachBanner")
      .every((call) => call.args[0] === "ait-ad-test-banner-id"),
  ).toBe(true);
  await page.evaluate(() =>
    (
      window as unknown as {
        __ait: { patch: (key: string, value: object) => void };
      }
    ).__ait.patch("ads", { forceNoFill: true }),
  );
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await expect(page.locator(".inline-banner.is-rendered")).toHaveCount(0);
  await expect(
    page.locator(".inline-banner-target [data-ait-slot-id]"),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as {
        __ait: { patch: (key: string, value: object) => void };
      }
    ).__ait.patch("ads", { forceNoFill: false }),
  );
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await expect(page.locator(".inline-banner.is-rendered")).toHaveCount(1);
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await expect(page.locator(".inline-banner.is-rendered")).toHaveCount(0);
  await expect(
    page.locator(".inline-banner-target [data-ait-slot-id]"),
  ).toHaveCount(0);
});
