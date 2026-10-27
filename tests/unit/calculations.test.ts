import { describe, expect, it } from "vitest";
import {
  addDays,
  calculateBMR,
  calculateCycleBalance,
  calculateDailyActivityAdjustment,
  calculateDailyExpenditure,
  calculateExerciseCalories,
  calculateRemainingCalories,
  calculateRecordedBalance,
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
  it("sums only recorded dates once and updates when a day's last record is removed", () => {
    const wallet = fixture();
    expect(calculateRecordedBalance(wallet, "2026-10-03")).toBe(0);
    wallet.meals = [100, 200].map((calories) => ({
      ...stamp(),
      date: "2026-10-01",
      type: "breakfast" as const,
      name: "음식",
      calories,
      memo: "",
    }));
    wallet.exercises = [exercise({ source: "extra" })];
    wallet.meta.activityRecords = [
      { ...stamp(), date: "2026-10-03", movement: "stepsExact", steps: 5000 },
    ];
    wallet.weights = [{ ...stamp(), date: "2026-10-02", weight: 70 }];
    expect(calculateRecordedBalance(wallet, "2026-10-03")).toBeCloseTo(
      daily(wallet, "2026-10-01")!.balance +
        daily(wallet, "2026-10-03")!.balance,
    );
    expect(calculateRecordedBalance(wallet, "2026-10-02")).toBeCloseTo(
      daily(wallet, "2026-10-01")!.balance,
    );
    wallet.meals = [];
    wallet.exercises = [];
    expect(calculateRecordedBalance(wallet, "2026-10-03")).toBeCloseTo(
      daily(wallet, "2026-10-03")!.balance,
    );
    wallet.meta.workoutStatus = [
      { ...stamp(), date: "2026-10-02", workedOut: false },
    ];
    expect(calculateRecordedBalance(wallet, "2026-10-03")).toBeCloseTo(
      daily(wallet, "2026-10-02")!.balance +
        daily(wallet, "2026-10-03")!.balance,
    );
  });
  it("uses exact steps only for direct input and accepts a recorded zero", () => {
    const tdee = fixture().tdee_history[0];
    const activity = {
      ...stamp(),
      date: "2026-10-01",
      steps: 5000,
      movement: "stepsExact" as const,
    };
    expect(calculateDailyActivityAdjustment(tdee, activity)).toBeCloseTo(
      -22.05,
    );
    expect(
      calculateDailyActivityAdjustment(tdee, { ...activity, steps: 5500 }),
    ).toBeCloseTo(-11.025);
    expect(
      calculateDailyActivityAdjustment(tdee, { ...activity, steps: 0 }),
    ).toBeCloseTo(-132.3);
    expect(
      calculateDailyActivityAdjustment(tdee, {
        ...activity,
        movement: "steps3000to6000",
      }),
    ).toBeCloseTo(-33.075);
  });
  it("uses the new highest activity band without changing historical six-band records", () => {
    const tdee = fixture().tdee_history[0];
    const activity = { ...stamp(), date: "2026-10-01", steps: null };
    expect(
      calculateDailyActivityAdjustment(tdee, {
        ...activity,
        movement: "steps12000plus",
      }),
    ).toBeCloseTo(165.375);
    expect(
      calculateDailyActivityAdjustment(tdee, {
        ...activity,
        movement: "steps12000to15000",
      }),
    ).toBeCloseTo(165.375);
    expect(
      calculateDailyActivityAdjustment(tdee, {
        ...activity,
        movement: "steps15000plus",
      }),
    ).toBeCloseTo(231.525);
  });
  it("calculates net hiking calories for each intensity", () => {
    expect(calculateExerciseCalories("hiking", "light", 60, 70)).toBeCloseTo(
      205.8,
    );
    expect(calculateExerciseCalories("hiking", "moderate", 60, 70)).toBeCloseTo(
      367.5,
    );
    expect(calculateExerciseCalories("hiking", "hard", 60, 70)).toBeCloseTo(
      573.3,
    );
  });
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
  it("uses exercise-day TDEE when a planned workout is marked and adds extra workouts", () => {
    const t = fixture().tdee_history[0];
    expect(
      calculateDailyExpenditure(
        t,
        [exercise(), exercise({ source: "extra" })],
        "2026-10-01",
        true,
      ),
    ).toBeCloseTo(t.exerciseDay + 275.625);
  });
  it("respects an explicit no-workout selection over legacy regular exercise entries", () => {
    const t = fixture().tdee_history[0];
    expect(
      calculateDailyExpenditure(t, [exercise()], "2026-10-01", false),
    ).toBe(t.rest);
  });
  it("applies a saved workout status to the daily balance", () => {
    const w = fixture(),
      t = w.tdee_history[0];
    w.meta.workoutStatus = [
      { ...stamp(), date: "2026-10-01", workedOut: true },
    ];
    expect(daily(w, "2026-10-01")?.expenditure).toBe(t.exerciseDay);
  });
  it("adjusts daily TDEE for selected activity and adds logged exercise separately", () => {
    const w = fixture();
    const t = w.tdee_history[0];
    const activity = {
      ...stamp(),
      date: "2026-10-01",
      steps: null,
      movement: "steps6000to9000" as const,
    };
    w.meta.activityRecords = [activity];
    const adjustment = calculateDailyActivityAdjustment(t, activity);
    expect(adjustment).toBeGreaterThan(0);
    expect(
      calculateDailyActivityAdjustment(t, {
        ...activity,
        movement: "steps9000to12000",
      }) - adjustment,
    ).toBeCloseTo(
      calculateExerciseCalories("walking", "light", 30, t.profile.weight),
    );
    expect(daily(w, activity.date)?.expenditure).toBeCloseTo(
      t.rest + adjustment,
    );
    w.exercises = [exercise({ source: "extra" })];
    expect(daily(w, activity.date)?.expenditure).toBeCloseTo(
      t.rest + adjustment + w.exercises[0].calories,
    );
    expect(daily(w, activity.date)?.remaining).toBeCloseTo(
      t.rest + adjustment + w.exercises[0].calories - 300,
    );
    w.meta.activityRecords = [{ ...activity, movement: "steps0to3000" }];
    expect(
      calculateDailyActivityAdjustment(t, w.meta.activityRecords[0]),
    ).toBeLessThan(0);
    expect(calculateDailyActivityAdjustment(t)).toBe(0);
    expect(
      calculateDailyActivityAdjustment(t, {
        ...activity,
        movement: "steps8000to10000",
      }),
    ).toBeCloseTo(
      calculateExerciseCalories("walking", "light", 90, t.profile.weight) -
        calculateExerciseCalories("walking", "light", 60, t.profile.weight),
    );
    expect(
      calculateDailyActivityAdjustment(t, {
        ...activity,
        movement: "moderate",
      }),
    ).toBeCloseTo(
      calculateExerciseCalories("walking", "light", 80, t.profile.weight) -
        calculateExerciseCalories("walking", "light", 60, t.profile.weight),
    );
    expect(
      calculateDailyActivityAdjustment(t, {
        ...activity,
        movement: "oneToTwo",
      }),
    ).toBe(0);
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
  it("includes unrecorded dates as zero intake in cumulative balance", () => {
    const w = fixture();
    expect(calculateTotalBalance(w, "2026-10-03").balance).toBe(
      -w.tdee_history[0].rest * 3,
    );
    expect(calculateTotalBalance(w, "2026-10-03").completed).toBe(3);
  });
  it("excludes future expenditure from automatic cumulative balance", () => {
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
