import { expect, test, type Page } from "@playwright/test";
import { fixture } from "../fixtures";

test("restores an old onboarding draft into the shortened flow", async ({
  page,
}) => {
  const wallet = fixture();
  const draft = {
    schemaVersion: 3,
    step: 6,
    profile: {
      ...wallet.profile!,
      habits: [{ ...wallet.profile!.habits[0], minutes: null }],
    },
    goal: wallet.goal_history[0],
    cycle: { ...wallet.cycle_history[0], weekday: 4 },
    correction: 0,
  };
  await page.addInitScript((value) => {
    localStorage.setItem(
      "__ait_storage:calorie_wallet_draft",
      JSON.stringify(value),
    );
  }, draft);
  await page.goto("/");
  await page
    .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
    .click();
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("3/4");
  await expect(page.getByLabel("시작 요일", { exact: true })).toHaveValue("4");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByText("예상 기초대사량", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("체중 감량", { exact: true })).toBeVisible();
  await expect(page.getByText("목요일", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "설정 완료하기", exact: true })
    .click();
  await expect(page.locator(".balance-card")).toBeVisible();
});

async function onboard(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await page.getByLabel("나이", { exact: true }).fill("30");
  await page.getByLabel("키 (cm)", { exact: true }).fill("175");
  await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("70");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 400 });
  const fixedControls = await page.locator(".onboarding").evaluate((root) => {
    const header = root.querySelector(".onboarding-progress")!;
    const content = root.querySelector<HTMLElement>(".onboarding-content")!;
    const footer = root.querySelector(".footer-actions")!;
    const headerTop = header.getBoundingClientRect().top;
    const footerTop = footer.getBoundingClientRect().top;
    content.scrollTop = content.scrollHeight;
    const result = {
      scrollTop: content.scrollTop,
      headerTop,
      headerTopAfter: header.getBoundingClientRect().top,
      footerTop,
      footerTopAfter: footer.getBoundingClientRect().top,
    };
    content.scrollTop = 0;
    return result;
  });
  expect(fixedControls.scrollTop).toBeGreaterThan(0);
  expect(fixedControls.headerTopAfter).toBeLessThan(fixedControls.headerTop);
  expect(fixedControls.footerTopAfter).toBe(fixedControls.footerTop);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("2/4");
  await expect(
    page.getByText("비운동일 목표 섭취량", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("어떤 목표로 칼로리를 관리하시나요?", { exact: true })
    .selectOption("lose");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("3/4");
  await page.getByLabel("시작 요일", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.locator(".onboarding-progress .eyebrow")).toHaveText("4/4");
  await expect(
    page.getByText("예상 기초대사량", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("체중 감량", { exact: true })).toBeVisible();
  await expect(page.getByText("수요일", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/onboarding-summary.png" });
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByText("운동하지 않는 날 예상 소비량", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    (
      window as unknown as { __ait: { trigger: (event: string) => void } }
    ).__ait.trigger("backEvent"),
  );
  await expect(page.getByLabel("시작 요일", { exact: true })).toHaveValue("3");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "설정 완료하기", exact: true })
    .click();
  await expect(page.locator(".balance-card")).toBeVisible();
}
test("short onboarding saves its summary and resumes the completed wallet", async ({
  page,
}) => {
  await onboard(page);
  await page.reload();
  await expect(page.locator(".balance-card")).toBeVisible();
  const saved = await page.evaluate(() => ({
    profile: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_profile")!,
    ).data,
    goals: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_goal_history")!,
    ).data,
    cycles: JSON.parse(
      localStorage.getItem("__ait_storage:calorie_wallet_cycle_history")!,
    ).data,
  }));
  expect(saved.profile.age).toBe(30);
  expect(saved.profile.habits).toEqual([]);
  expect(saved.goals[0].kind).toBe("lose");
  expect(saved.cycles[0].weekday).toBe(3);
});

test("exercise records no longer ask about a preset routine", async ({
  page,
}) => {
  await onboard(page);
  await expect(
    page.getByText("오늘 비운동일 TDEE", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await expect(page.getByLabel("기록 날짜")).toHaveCount(0);
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await expect(page.getByLabel("기록 날짜")).toHaveCount(0);
  await expect(
    page.getByText("설정한 운동 루틴을 진행하셨나요?", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "운동 내역", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "운동 기록 추가" }),
  ).toBeVisible();
});

test("today's missing records mark activity and records tabs", async ({
  page,
}) => {
  await onboard(page);
  const activityTab = page.getByRole("button", { name: "활동", exact: true });
  const recordsTab = page.getByRole("button", { name: "기록", exact: true });
  await expect(activityTab.locator(".tab-alert")).toHaveCount(1);
  await expect(recordsTab.locator(".tab-alert")).toHaveCount(1);
  await activityTab.click();
  await expect(page.getByRole("heading", { name: "기록한 운동" })).toHaveCount(
    0,
  );
  await expect(page.locator(".activity-level")).toHaveCount(5);
  await page.getByRole("button", { name: "3,000~6,000보 미만" }).click();
  await expect(activityTab.locator(".tab-alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /3,000~6,000보 미만/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "6,000~9,000보 미만" }).click();
  await expect(
    page.getByRole("button", { name: /6,000~9,000보 미만/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await recordsTab.click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("아침 식사");
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("350");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(recordsTab.locator(".tab-alert")).toHaveCount(0);
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await page.getByRole("button", { name: "운동 기록 추가" }).click();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("button", { name: "캘린더", exact: true }).click();
  await expect(page.getByText("아침 식사", { exact: false })).toBeVisible();
  await expect(
    page.getByText("6,000~9,000보 미만", { exact: true }),
  ).toBeVisible();
  const selectedDay = page.locator(".calendar-day.selected");
  await expect(selectedDay.locator(".calendar-marker")).toHaveCount(3);
  expect(
    await selectedDay
      .locator(".calendar-marker")
      .evaluateAll(
        (markers) =>
          new Set(
            markers.map((marker) => getComputedStyle(marker).backgroundColor),
          ).size,
      ),
  ).toBe(3);
  expect(
    await page
      .locator(".calendar-grid-wrap")
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(308);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".calendar-day:not(:disabled)")
      .first()
      .evaluate((button) => button.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(44);
  await page.reload();
  await expect(activityTab.locator(".tab-alert")).toHaveCount(0);
  await expect(recordsTab.locator(".tab-alert")).toHaveCount(0);
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".home-action-stage.done")).toHaveCount(3);
});

test("activity changes today's TDEE and exercise adds to it", async ({
  page,
}) => {
  await onboard(page);
  const balance = async () =>
    Number(
      (await page.locator(".hero-number").innerText()).replace(/[^\d]/g, ""),
    );
  const initialBalance = await balance();
  await page.getByRole("button", { name: "활동", exact: true }).click();
  await page.getByRole("button", { name: "12,000보 이상" }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  const afterActivity = await balance();
  expect(afterActivity).toBeGreaterThan(initialBalance);
  await page.getByRole("button", { name: "기록", exact: true }).click();
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await page.getByRole("button", { name: "운동 기록 추가" }).click();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  expect(await balance()).toBeGreaterThan(afterActivity);
});

test.describe("record tab swipe", () => {
  test.use({ isMobile: true, hasTouch: true });

  test("switches sideways without changing tabs on vertical gestures or in dialogs", async ({
    page,
  }) => {
    await onboard(page);
    await page.getByRole("button", { name: "기록", exact: true }).click();
    const mealTab = page.getByRole("button", { name: "식단", exact: true });
    const exerciseTab = page.getByRole("button", { name: "운동", exact: true });
    const session = await page.context().newCDPSession(page);
    const swipe = async (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
    ) => {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: startX, y: startY }],
      });
      for (let step = 1; step <= 5; step++)
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [
            {
              x: startX + ((endX - startX) * step) / 5,
              y: startY + ((endY - startY) * step) / 5,
            },
          ],
        });
      await session.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    };
    const heading = await page.locator(".record-swipe-area h1").boundingBox();
    expect(heading).not.toBeNull();
    const y = Math.round(heading!.y + heading!.height / 2);
    await swipe(300, y, 80, y);
    await expect(exerciseTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".record-swipe-panel.exercise")).toHaveCSS(
      "animation-name",
      "record-panel-from-right",
    );
    await swipe(80, y, 300, y);
    await expect(mealTab).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(".record-swipe-panel.meal")).toHaveCSS(
      "animation-name",
      "none",
    );
    await swipe(300, y, 280, y + 120);
    await expect(mealTab).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "아침 추가", exact: true }).click();
    const dialogHeading = await page.locator("dialog h2").boundingBox();
    expect(dialogHeading).not.toBeNull();
    await swipe(300, dialogHeading!.y + 10, 80, dialogHeading!.y + 10);
    await expect(mealTab).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toBeVisible();
    await session.detach();
  });
});

test("first setup, CRUD, persistence, settings and reset", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await onboard(page);
  await page.screenshot({
    path: "test-results/home-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: /식단 기록/ }).click();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("테스트 현미밥");
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("350");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByText("테스트 현미밥", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("400");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.locator(".record").getByText("400 kcal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "아침 추가", exact: true }).click();
  await page.getByLabel("음식 이름", { exact: true }).fill("테스트 바나나");
  await page.getByLabel("칼로리 (kcal)", { exact: true }).fill("100");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.locator(".record")).toHaveCount(2);
  await page.getByRole("button", { name: "삭제", exact: true }).last().click();
  await page.getByRole("button", { name: "삭제하기", exact: true }).click();
  await expect(page.locator(".record")).toHaveCount(1);
  await page.getByRole("button", { name: "운동", exact: true }).click();
  await page
    .getByRole("button", { name: "운동 기록 추가", exact: true })
    .click();
  await page.getByLabel("운동 종류", { exact: true }).selectOption("running");
  await page
    .getByLabel("추가 소비량 직접 입력 (kcal, 선택)", { exact: true })
    .fill("200");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.locator(".record").getByText("200 kcal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page
    .getByLabel("추가 소비량 직접 입력 (kcal, 선택)", { exact: true })
    .fill("250");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(page.locator(".home-action-stage.done")).toHaveCount(2);
  await page.reload();
  await expect(page.locator(".balance-card")).toBeVisible();
  await expect(page.locator(".home-action-stage.done")).toHaveCount(2);
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page.getByRole("button", { name: "목표 재설정", exact: true }).click();
  await page
    .getByLabel("어떤 목표로 칼로리를 관리하시나요?", { exact: true })
    .selectOption("lose");
  await page.getByLabel("하루 목표 적자 (kcal)", { exact: true }).fill("300");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "목표를 오늘부터 적용했어요",
  );
  await page
    .getByRole("button", { name: "관리 주기 변경", exact: true })
    .click();
  await page.getByLabel("시작 요일", { exact: true }).selectOption("4");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page
    .getByRole("button", { name: "모든 데이터 초기화", exact: true })
    .click();
  await page
    .getByLabel("확인하려면 ‘초기화’를 입력해주세요", { exact: true })
    .fill("초기화");
  await page
    .getByRole("button", { name: "모두 삭제하기", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "아무 곳이나 터치해 시작하기",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("saves incomplete onboarding fields and keeps a white background under dark system settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    )
    .toBe("rgb(255, 255, 255)");
  await page.screenshot({ path: "test-results/welcome-dark.png" });
  await page
    .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await page.getByLabel("나이", { exact: true }).fill("32");
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("__ait_storage:calorie_wallet_draft") ?? "{}",
          ).profile?.age,
      ),
    )
    .toBe(32);
  await page.reload();
  await page
    .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
    .click();
  await expect(page.getByLabel("나이", { exact: true })).toHaveValue("32");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const smallText = await page.locator(".app-shell").evaluate((root) =>
    Array.from(root.querySelectorAll("*"))
      .filter(
        (el) =>
          el.textContent?.trim() &&
          getComputedStyle(el).display !== "none" &&
          parseFloat(getComputedStyle(el).fontSize) <= 11,
      )
      .map((el) => el.tagName),
  );
  expect(smallText).toEqual([]);
  await page.screenshot({
    path: "test-results/onboarding-dark.png",
    fullPage: true,
  });
});

test("recalculation preserves today's balance", async ({ page }) => {
  await onboard(page);
  const oldToday = await page.locator(".balance-card").innerText();
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page
    .getByRole("button", { name: "다시 계산하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await expect(page.getByLabel("현재 체중 (kg)", { exact: true })).toHaveValue(
    "70",
  );
  await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("65");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("체중 감량", { exact: true })).toBeVisible();
  await expect(page.getByText("수요일", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.locator(".balance-card")).toHaveText(oldToday, {
    useInnerText: true,
  });
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/home-dark.png", fullPage: true });
});

test("all tabs keep readable text and touch targets in light and dark modes", async ({
  page,
}) => {
  await onboard(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const tab of ["홈", "활동", "기록", "캘린더", "마이"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      const issues = await page.locator(".app-shell").evaluate((root) => {
        const issues: string[] = [];
        if (
          getComputedStyle(document.body).backgroundColor !==
          "rgb(255, 255, 255)"
        )
          issues.push("background is not white");
        if (
          getComputedStyle(document.documentElement)
            .getPropertyValue("--brand")
            .trim() !== "#0f9d58"
        )
          issues.push("brand green mismatch");
        const visible = (el: Element) => {
          const rect = el.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            getComputedStyle(el).visibility !== "hidden"
          );
        };
        for (const el of Array.from(root.querySelectorAll("*"))) {
          if (!visible(el)) continue;
          const style = getComputedStyle(el);
          if (el.textContent?.trim() && parseFloat(style.fontSize) <= 11)
            issues.push(`small text: ${el.tagName}`);
          if (el.matches("button,input,select,summary")) {
            const rect = el.getBoundingClientRect();
            if (rect.height < 43.9 || rect.width < 43.9)
              issues.push(`small target: ${el.textContent?.slice(0, 20)}`);
          }
        }
        // Enabled action labels must retain 4.5:1 contrast through TDS motion styles.
        const luminance = (rgb: string) => {
          const channels = (rgb.match(/[\d.]+/g) ?? [])
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
          return (
            0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
          );
        };
        for (const button of root.querySelectorAll<HTMLButtonElement>(
          "button.wallet-action:not(:disabled)",
        )) {
          const style = getComputedStyle(button),
            a = luminance(style.backgroundColor),
            b = luminance(style.color),
            ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
          if (ratio < 4.5)
            issues.push(`contrast: ${button.textContent?.trim()} (${ratio})`);
        }
        if (document.documentElement.scrollWidth > innerWidth)
          issues.push("horizontal overflow");
        return issues;
      });
      expect(issues, `${scheme} ${tab}`).toEqual([]);
    }
  }
});

test.describe("mobile viewport gestures", () => {
  test.use({ isMobile: true, hasTouch: true });
  test("blocks pinch zoom and keeps normal touch scrolling", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.locator("meta[name=viewport]")).toHaveAttribute(
      "content",
      /maximum-scale=1, user-scalable=no/,
    );
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).touchAction,
      ),
    ).toBe("pan-x pan-y");
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: 140, y: 300 },
        { x: 240, y: 300 },
      ],
    });
    for (let i = 1; i <= 5; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 140 - i * 12, y: 300 },
          { x: 240 + i * 12, y: 300 },
        ],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() => page.evaluate(() => window.visualViewport?.scale))
      .toBe(1);
    await page
      .getByRole("button", { name: "아무 곳이나 터치해 시작하기", exact: true })
      .click();
    await page
      .getByRole("button", { name: "계산 시작하기", exact: true })
      .click();
    await page.getByLabel("나이", { exact: true }).fill("30");
    await page.getByLabel("키 (cm)", { exact: true }).fill("175");
    await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("70");
    await expect
      .poll(() => page.evaluate(() => window.visualViewport?.scale))
      .toBe(1);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 400 });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 200 }],
    });
    for (let i = 1; i <= 5; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y: 200 - i * 25 }],
      });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect
      .poll(() =>
        page
          .locator(".onboarding-content")
          .evaluate((element) => element.scrollTop),
      )
      .toBeGreaterThan(0);
    await session.detach();
  });
});
