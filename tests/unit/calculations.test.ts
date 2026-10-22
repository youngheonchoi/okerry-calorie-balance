import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateBMR,
  calculateCycleBalance,
  calculateDailyExpenditure,
  calculateExerciseCalories,
  calculateRemainingCalories,
  calculateTotalBalance,
  daily,
  datesBetween,
  estimateDailyTDEE,
  getCycleDateRange,
  historicalCycle,
} from "../../src/domain/calculations";
import { stamp } from "../../src/domain/model";
import { exercise, fixture } from "../fixtures";
describe("energy accounting", () => {
  it("uses the specified Mifflin formulas and manual BMR", () => {
    const p = fixture().profile!;
    expect(calculateBMR(p)).toBe(1648.75);
    expect(calculateBMR({ ...p, basis: "female" })).toBe(1482.75);
    expect(calculateBMR({ ...p, basis: "manual", manualBmr: 1500 })).toBe(1500);
  });
  it("uses net exercise cost and respects explicit zero calories", () => {
    expect(
      calculateExerciseCalories("running", "moderate", 30, 70),
    ).toBeCloseTo(275.625);
    expect(calculateExerciseCalories("running", "moderate", 30, 70, 0)).toBe(0);
  });
  it("does not add daily walking inputs together", () => {
    const p = fixture().profile!,
      baseline = estimateDailyTDEE(p);
    expect(
      estimateDailyTDEE({
        ...p,
        lifestyle: { ...p.lifestyle, steps: 0, walkMinutes: 0 },
      }).rest,
    ).toBe(baseline.rest);
  });
  it("does not multiply occupation on top of detailed activity", () => {
    const p = fixture().profile!;
    expect(
      estimateDailyTDEE({
        ...p,
        lifestyle: { ...p.lifestyle, occupation: 3, workHours: 12 },
      }).rest,
    ).toBe(estimateDailyTDEE(p).rest);
  });
  it("averages commuting and weekend NEAT while avoiding duplicate step-count walking", () => {
    const p = fixture().profile!;
    const base = estimateDailyTDEE({
      ...p,
      lifestyle: {
        ...p.lifestyle,
        steps: 6000,
        stepBand: "5000to8000",
        sittingBand: "7to8",
        commuteDays: 5,
        commuteOutMode: "other",
        commuteReturnMode: "other",
        weekendActivity: "sedentary",
      },
    });
    const duplicateWalk = estimateDailyTDEE({
      ...p,
      lifestyle: {
        ...p.lifestyle,
        steps: 6000,
        stepBand: "5000to8000",
        sittingBand: "7to8",
        commuteDays: 5,
        commuteOutMode: "other",
        commuteReturnMode: "walk",
        commuteReturnWalkKm: 3,
        weekendActivity: "sedentary",
      },
    });
    expect(duplicateWalk.rest).toBeCloseTo(base.rest);
    const frequentBike = estimateDailyTDEE({
      ...p,
      lifestyle: {
        ...p.lifestyle,
        steps: 6000,
        stepBand: "5000to8000",
        sittingBand: "7to8",
        commuteDays: 5,
        commuteOutMode: "bike",
        commuteOutBikeMinutes: 10,
        commuteReturnMode: "other",
        weekendActivity: "active",
      },
    });
    expect(frequentBike.rest).toBeGreaterThan(base.rest);
  });
  it("includes TEF once and separates weekly exercise from daily records", () => {
    const w = fixture(),
      t = w.tdee_history[0];
    expect(t.rest).toBeCloseTo(t.bmr + t.nonExercise + t.tef);
    expect(t.average - t.rest).toBeCloseTo(t.weeklyExercise / 7);
    expect(calculateDailyExpenditure(t, [], "2026-10-01")).toBe(t.rest);
    expect(
      calculateDailyExpenditure(t, [exercise()], "2026-10-01"),
    ).toBeCloseTo(t.rest + 275.625);
  });
  it("adds regular and extra exercises once, excludes already-counted daily movement", () => {
    const t = fixture().tdee_history[0];
    expect(
      calculateDailyExpenditure(
        t,
        [
          exercise(),
          exercise({ source: "extra" }),
          exercise({ source: "daily" }),
        ],
        "2026-10-01",
      ),
    ).toBeCloseTo(t.rest + 551.25);
  });
  it("separates remaining budget and energy deficit", () => {
    const w = fixture();
    w.meals = [
      {
        ...stamp(),
        date: "2026-10-01",
        type: "lunch",
        name: "test",
        calories: 2000,
        memo: "",
      },
    ];
    const d = daily(w, "2026-10-01")!;
    expect(d.balance).toBeCloseTo(2000 - d.expenditure);
    expect(d.remaining).toBeCloseTo(d.expenditure - 300 - 2000);
    expect(calculateRemainingCalories(1600, 1800)).toBe(-200);
  });
  it("preserves historical TDEE and goals", () => {
    const w = fixture(),
      before = daily(w, "2026-10-01");
    w.tdee_history.push({
      ...stamp(),
      effectiveFrom: "2026-10-10",
      ...estimateDailyTDEE({ ...w.profile!, weight: 80 }),
    });
    w.goal_history.push({
      ...stamp(),
      effectiveFrom: "2026-10-10",
      kind: "gain",
      balance: 200,
    });
    expect(daily(w, "2026-10-01")).toEqual(before);
    expect(daily(w, "2026-10-10")!.goalBalance).toBe(200);
  });
  it("does not treat missing meals as zero intake in cumulative balance", () => {
    const w = fixture();
    expect(calculateTotalBalance(w, "2026-10-03").balance).toBe(0);
    w.meta.completedDays = ["2026-10-01"];
    expect(calculateTotalBalance(w, "2026-10-03").balance).toBe(
      -w.tdee_history[0].rest,
    );
  });
  it("excludes future expenditure even if erroneously marked complete", () => {
    const w = fixture();
    w.meta.completedDays = ["2026-10-01", "2026-10-02"];
    const total = calculateCycleBalance(
      w,
      "2026-10-01",
      "2026-10-07",
      "2026-10-01",
    );
    expect(total.rows).toHaveLength(1);
    expect(total.completed).toBe(1);
  });
});
describe("local calendar and management cycles", () => {
  it("handles month/year and leap-day boundaries", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(datesBetween("2026-10-01", "2026-10-03")).toHaveLength(3);
  });
  it("finds all seven weekly starting weekdays", () => {
    const c = fixture().cycle_history[0];
    for (let weekday = 0; weekday < 7; weekday++) {
      const range = getCycleDateRange("2026-10-22", { ...c, weekday });
      expect(new Date(range.start + "T12:00:00").getDay()).toBe(weekday);
      expect(datesBetween(range.start, range.end)).toHaveLength(7);
      expect(range.start <= "2026-10-22" && range.end >= "2026-10-22").toBe(
        true,
      );
    }
  });
  it("handles daily and custom cycles before the anchor", () => {
    const c = fixture().cycle_history[0];
    expect(getCycleDateRange("2026-10-22", { ...c, kind: "daily" })).toEqual({
      start: "2026-10-22",
      end: "2026-10-22",
    });
    expect(
      getCycleDateRange("2026-10-01", {
        ...c,
        kind: "custom",
        anchor: "2026-10-03",
        days: 3,
      }),
    ).toEqual({ start: "2026-09-30", end: "2026-10-02" });
  });
  it("keeps old cycle boundaries when settings change", () => {
    const w = fixture();
    w.cycle_history.push({
      ...stamp(),
      kind: "custom",
      effectiveFrom: "2026-10-08",
      anchor: "2026-10-08",
      days: 3,
      weekday: 1,
    });
    expect(historicalCycle(w, "2026-10-07")).toEqual({
      start: "2026-10-05",
      end: "2026-10-07",
    });
    expect(historicalCycle(w, "2026-10-08")).toEqual({
      start: "2026-10-08",
      end: "2026-10-10",
    });
  });
});
