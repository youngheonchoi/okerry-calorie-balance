import { describe, expect, it } from "vitest";
import { fixture, exercise } from "../fixtures";
import { stamp } from "../../src/domain/model";
import {
  createRecordReport,
  exportRangeError,
  recordReportCsv,
  recordReportPrompt,
  type ExportSelection,
} from "../../src/domain/recordExport";
const all: ExportSelection = {
  profile: true,
  activity: true,
  meals: true,
  exercises: true,
};
const range = { start: "2026-10-01", end: "2026-10-03" };
function wallet() {
  const w = fixture();
  w.tdee_history[0].rest = 2000;
  w.meals = [
    {
      ...stamp(),
      date: range.start,
      type: "breakfast",
      name: "사과",
      calories: 190,
      quantity: 2,
      memo: "",
    },
  ];
  w.exercises = [exercise({ date: range.end, source: "extra", calories: 300 })];
  return w;
}
describe("record export", () => {
  it("includes the unrecorded day and counts full expenditure, with meals already quantity-adjusted", () => {
    const report = createRecordReport(wallet(), range, all, range.end);
    expect(report.balance).toBe(-6110); // 190 intake - (3 x 2000 + 300 extra exercise).
    const meals = report.sections.find((section) => section.title === "식단")!;
    expect(meals.rows[0]).toEqual([
      range.start,
      "아침",
      "사과",
      2,
      95,
      190,
      "",
    ]);
    expect(meals.rows[1]).toEqual(["2026-10-02", "", "미기록", "", "", "", ""]);
  });
  it("includes only the end-date profile once in CSV and prompt", () => {
    const w = wallet();
    const first = w.tdee_history[0];
    w.tdee_history.push({
      ...first,
      ...stamp(),
      effectiveFrom: "2026-10-02",
      bmr: 1600,
      profile: { ...first.profile, weight: 80 },
    });
    w.tdee_history.push({
      ...first,
      ...stamp(),
      effectiveFrom: "2026-10-04",
      bmr: 1700,
      profile: { ...first.profile, weight: 90 },
    });
    const report = createRecordReport(w, range, all, "2026-10-04");
    const info = report.sections[0];
    expect(info.rows).toEqual([[range.end, "남성 기준", 30, 175, 80, 1600]]);
    const csv = recordReportCsv(report);
    expect(csv.match(/"남성 기준"/g)).toHaveLength(1);
    expect(csv).toContain('"2026-10-03","남성 기준","30","175","80","1600"');
    const data = JSON.parse(
      recordReportPrompt(report).split("[기록 데이터]\n")[1],
    );
    expect(data["내 정보"]).toEqual({
      기준일: range.end,
      "계산 기준": "남성 기준",
      "나이(세)": 30,
      "키(cm)": 175,
      "체중(kg)": 80,
      "기초대사량(kcal)": 1600,
    });
    expect(data["활동"]).toHaveLength(3);
  });
  it("omits unchecked personal/activity/workout information from both output formats", () => {
    const report = createRecordReport(
      wallet(),
      range,
      { profile: false, activity: false, meals: true, exercises: false },
      range.end,
    );
    expect(report.sections.map((section) => section.title)).toEqual(["식단"]);
    const prompt = recordReportPrompt(report);
    const data = JSON.parse(prompt.split("[기록 데이터]\n")[1]);
    expect(Object.keys(data)).toEqual(["공통 요약", "식단"]);
    expect(recordReportCsv(report)).not.toContain("키(cm)");
    expect(prompt).not.toContain('"체중(kg)"');
  });
  it("escapes commas, quotes, line breaks and spreadsheet formulas, while keeping numeric balances numeric", () => {
    const w = wallet();
    w.meals[0].name = '=HYPERLINK("x","y")';
    w.meals[0].memo = '첫 줄, "메모"\n다음 줄';
    const csv = recordReportCsv(createRecordReport(w, range, all, range.end));
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"\'=HYPERLINK(""x"",""y"")"');
    expect(csv).toContain('"첫 줄, ""메모""\n다음 줄"');
    expect(csv).toContain('"-6110"');
    expect(csv).not.toContain('"\'-6110"');
  });
  it("allows a summary-only export", () => {
    const report = createRecordReport(
      wallet(),
      range,
      { profile: false, activity: false, meals: false, exercises: false },
      range.end,
    );
    expect(report.sections).toHaveLength(0);
    expect(report.balance).toBe(-6110);
    expect(recordReportCsv(report)).toContain("누적 칼로리 잔고(kcal)");
  });
  it.each([
    { start: "2026-10-03", end: "2026-10-01" },
    { start: "2026-09-30", end: "2026-10-03" },
    { start: "2026-10-01", end: "2026-10-04" },
    { start: "2026-02-30", end: "2026-10-03" },
  ])("rejects invalid or out-of-range dates %o", (period) => {
    expect(exportRangeError(wallet(), period, range.end)).not.toBe("");
    expect(() =>
      createRecordReport(wallet(), period, all, range.end),
    ).toThrow();
  });
});
