import { expect, test, type Page } from "@playwright/test";
import { fixture } from "../fixtures";
import { addDays, localDate } from "../../src/domain/calculations";
import { readFile } from "node:fs/promises";

async function onboard(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "처음이에요", exact: true }).click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await page.getByLabel("만 나이 (세)", { exact: true }).fill("30");
  await page.getByLabel("키 (cm)", { exact: true }).fill("175");
  await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("70");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  const fixedControls = await page.locator(".onboarding").evaluate((root) => {
    const header = root.querySelector(".onboarding-header")!;
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
  expect(fixedControls.headerTopAfter).toBe(fixedControls.headerTop);
  expect(fixedControls.footerTopAfter).toBe(fixedControls.footerTop);
  await page
    .getByLabel("운동하지 않는 평일의 하루 평균 걸음 수는 얼마인가요?", {
      exact: true,
    })
    .selectOption("5000to8000");
  await page
    .getByLabel("근무일에 실제로 앉아 있는 시간은 어느 정도인가요?", {
      exact: true,
    })
    .selectOption("7to8");
  await page.getByLabel("출퇴근 일수 (일/주)", { exact: true }).fill("5");
  await page.getByLabel("출근 방식", { exact: true }).selectOption("bike");
  await page.getByLabel("출근 자전거 시간 (분)", { exact: true }).fill("10");
  await page.getByLabel("퇴근 방식", { exact: true }).selectOption("walk");
  await page.getByLabel("퇴근 도보 거리 (km)", { exact: true }).fill("3");
  await page
    .getByLabel("주말에 운동을 제외한 활동량은 어떤 편인가요?", { exact: true })
    .selectOption("light");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "나의 하루 소비 칼로리", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".onboarding-header .eyebrow")).toHaveText("4/6");
  await page
    .getByRole("button", { name: "이 결과로 시작하기", exact: true })
    .click();
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "설정 완료하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "오늘의 칼로리 잔고", exact: true }),
  ).toBeVisible();
}
test("first setup, CRUD, persistence, settings, reset and backup restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await onboard(page);
  await page.screenshot({
    path: "test-results/home-empty.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "식단 기록", exact: true }).click();
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
  await page.getByRole("button", { name: "다시 기록", exact: true }).click();
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
  await page.getByLabel("운동 구분", { exact: true }).selectOption("regular");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(
    page.locator(".record").getByText("200 kcal", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "수정", exact: true }).click();
  await page
    .getByLabel("추가 소비량 직접 입력 (kcal, 선택)", { exact: true })
    .fill("250");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page
    .getByRole("button", {
      name: "선택한 날짜의 식사·운동 기록 완료하기",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await page.getByRole("button", { name: "홈", exact: true }).click();
  await expect(
    page.getByText("하루 기록을 완료했어요", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "오늘의 칼로리 잔고", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("하루 기록을 완료했어요", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page.getByRole("button", { name: "목표 재설정", exact: true }).click();
  await page
    .getByLabel("어떤 목표로 칼로리를 관리하시나요?", { exact: true })
    .selectOption("lose");
  await page.getByLabel("하루 목표 적자 (kcal)", { exact: true }).fill("300");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("부터 적용돼요");
  await page
    .getByRole("button", { name: "관리 주기 변경", exact: true })
    .click();
  await page
    .getByLabel("칼로리 잔고를 어떤 주기로 관리할까요?", { exact: true })
    .selectOption("custom");
  await page.getByLabel("주기 일수", { exact: true }).fill("10");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await page.getByRole("button", { name: "오늘 기록", exact: true }).click();
  await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("69.5");
  await page.getByRole("button", { name: "저장하기", exact: true }).click();
  await expect(page.getByText("69.5kg", { exact: true })).toBeVisible();
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
    page.getByRole("button", { name: "처음이에요", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "데이터 가져오기", exact: true })
    .click();
  const w = fixture();
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(w)),
  });
  await expect(
    page.getByRole("heading", {
      name: "복원할 데이터를 확인해주세요",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "확인하고 복원하기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "오늘의 칼로리 잔고", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("rejects invalid backups and supports JSON paste with optional omissions", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "데이터 가져오기", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "확인하고 복원하기", exact: true }),
  ).toHaveCount(0);
  await page.getByText("JSON 내용 붙여넣기", { exact: true }).click();
  const partial = fixture() as Partial<ReturnType<typeof fixture>>;
  delete partial.weights;
  await page
    .getByLabel("백업 JSON", { exact: true })
    .fill(JSON.stringify(partial));
  await page
    .getByRole("button", { name: "내용 검증하기", exact: true })
    .click();
  await expect(page.getByText(/누락 항목: weights/)).toBeVisible();
  await page
    .getByRole("button", { name: "확인하고 복원하기", exact: true })
    .click();
  await page.getByRole("button", { name: "식단", exact: true }).click();
  await page
    .getByLabel("기록 날짜", { exact: true })
    .fill(addDays(localDate(), -1));
  await page
    .getByRole("button", {
      name: "선택한 날짜의 식사·운동 기록 완료하기",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("완료하면 실제 섭취량 0kcal로 저장돼요.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "하루 기록 완료됨 · 다시 열기",
      exact: true,
    }),
  ).toBeVisible();
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
  await page.getByRole("button", { name: "처음이에요", exact: true }).click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await page.getByLabel("만 나이 (세)", { exact: true }).fill("32");
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
  await page.getByRole("button", { name: "처음이에요", exact: true }).click();
  await expect(page.getByLabel("만 나이 (세)", { exact: true })).toHaveValue(
    "32",
  );
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

test("recalculation preserves today and exports restorable JSON through official mock", async ({
  page,
}, testInfo) => {
  const w = fixture();
  await page.goto("/");
  await page
    .getByRole("button", { name: "데이터 가져오기", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(w)),
  });
  await page
    .getByRole("button", { name: "확인하고 복원하기", exact: true })
    .click();
  const oldToday = await page.locator(".balance-card").innerText();
  await page.getByRole("button", { name: "마이", exact: true }).click();
  await page
    .getByRole("button", { name: "TDEE 다시 계산하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "계산 시작하기", exact: true })
    .click();
  await expect(page.getByLabel("현재 체중 (kg)", { exact: true })).toHaveValue(
    "70",
  );
  await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("65");
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "다음", exact: true }).click();
  await page
    .getByRole("button", { name: "계산 결과 저장하기", exact: true })
    .click();
  await expect(page.locator(".balance-card")).toHaveText(oldToday, {
    useInnerText: true,
  });
  await page.getByRole("button", { name: "마이", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "JSON 파일 내보내기", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(
    `calorie-wallet-backup-${localDate()}.json`,
  );
  const path = testInfo.outputPath("backup.json");
  await download.saveAs(path);
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.tdee_history).toHaveLength(2);
  expect(exported.tdee_history[0].profile.weight).toBe(70);
  expect(exported.tdee_history[1].profile.weight).toBe(65);
  expect(exported.tdee_history[1].effectiveFrom).toBe(addDays(localDate(), 1));
  await page
    .getByRole("button", { name: "데이터 가져오기", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles(path);
  await expect(
    page.getByText(
      "현재 데이터 전체를 이 백업으로 덮어써요. 필요하면 먼저 내보내주세요.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "확인하고 복원하기", exact: true })
    .click();
  await expect(page.locator(".balance-card")).toHaveText(oldToday, {
    useInnerText: true,
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/home-dark.png", fullPage: true });
});

test("all tabs keep readable text and touch targets in light and dark modes", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "데이터 가져오기", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture())),
  });
  await page
    .getByRole("button", { name: "확인하고 복원하기", exact: true })
    .click();
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const tab of ["홈", "식단", "운동", "마이"]) {
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
    await page.getByRole("button", { name: "처음이에요", exact: true }).click();
    await page
      .getByRole("button", { name: "계산 시작하기", exact: true })
      .click();
    await page.getByLabel("만 나이 (세)", { exact: true }).fill("30");
    await page.getByLabel("키 (cm)", { exact: true }).fill("175");
    await page.getByLabel("현재 체중 (kg)", { exact: true }).fill("70");
    await expect
      .poll(() => page.evaluate(() => window.visualViewport?.scale))
      .toBe(1);
    await page.getByRole("button", { name: "다음", exact: true }).click();
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 180, y: 600 }],
    });
    for (let i = 1; i <= 5; i++)
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 180, y: 600 - i * 45 }],
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
