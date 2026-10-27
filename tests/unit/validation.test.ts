import { describe, expect, it } from "vitest";
import {
  bodySchema,
  dateSchema,
  draftProfileSchema,
  lifestyleSchema,
  mealSchema,
  validateWallet,
} from "../../src/domain/validation";
import { exercise, fixture } from "../fixtures";
import { stamp } from "../../src/domain/model";
describe("validation", () => {
  it("requires a valid integer step count for exact-step activity records", () => {
    const wallet = fixture();
    const activity = {
      ...stamp(),
      date: "2026-10-01",
      movement: "stepsExact" as const,
      steps: 0,
    };
    wallet.meta.activityRecords = [activity];
    expect(validateWallet(wallet).meta.activityRecords[0].steps).toBe(0);
    for (const steps of [null, -1, 0.5, 100001]) {
      expect(() =>
        validateWallet({
          ...wallet,
          meta: { ...wallet.meta, activityRecords: [{ ...activity, steps }] },
        }),
      ).toThrow();
    }
  });
  it("loads new and historical high-activity records without rewriting their bands", () => {
    for (const movement of [
      "steps12000plus",
      "steps12000to15000",
      "steps15000plus",
    ] as const) {
      const wallet = fixture();
      wallet.meta.activityRecords = [
        { ...stamp(), date: "2026-10-01", steps: null, movement },
      ];
      expect(
        validateWallet(JSON.parse(JSON.stringify(wallet))).meta
          .activityRecords[0].movement,
      ).toBe(movement);
    }
  });
  it("loads saved hiking records with their calculated calories", () => {
    const wallet = fixture();
    wallet.exercises = [
      exercise({ kind: "hiking", minutes: 60, calories: 367.5 }),
    ];
    expect(
      validateWallet(JSON.parse(JSON.stringify(wallet))).exercises[0],
    ).toMatchObject({ kind: "hiking", calories: 367.5 });
  });
  it("accepts legacy meals and validates new whole-number quantities", () => {
    const meal = {
      ...fixture().profile!,
      date: "2026-10-01",
      type: "breakfast",
      name: "사과",
      calories: 200,
      memo: "",
    };
    expect(mealSchema.safeParse(meal).success).toBe(true);
    expect(mealSchema.parse({ ...meal, quantity: 2 }).quantity).toBe(2);
    for (const quantity of [0, -1, 1.5, 1000]) {
      expect(mealSchema.safeParse({ ...meal, quantity }).success).toBe(false);
    }
  });
  it("rejects invalid dates and future records", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    const w = fixture();
    w.meta.completedDays = ["2199-01-01"];
    expect(() => validateWallet(w)).toThrow("미래");
  });
  it("requires all initialized settings", () => {
    const w = fixture();
    w.goal_history = [];
    expect(() => validateWallet(w)).toThrow("필수");
  });
  it("migrates legacy regular workout entries into daily workout status", () => {
    const w = fixture();
    delete (w.meta as Partial<typeof w.meta>).workoutStatus;
    delete (w.meta as Partial<typeof w.meta>).activityRecords;
    w.exercises = [exercise()];
    const migrated = validateWallet(w);
    expect(migrated.meta.workoutStatus).toMatchObject([
      { date: "2026-10-01", workedOut: true },
    ]);
    expect(migrated.meta.activityRecords).toEqual([]);
  });
  it("rejects duplicate daily activity dates", () => {
    const w = fixture();
    const activity = {
      id: "activity-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      date: "2026-10-01",
      steps: 4000,
      movement: "oneToTwo" as const,
    };
    w.meta.activityRecords = [activity, { ...activity, id: "activity-2" }];
    expect(() => validateWallet(w)).toThrow("활동 기록 날짜");
  });
  it("rejects duplicate IDs and duplicate effective dates", () => {
    const w = fixture();
    w.exercises = [exercise(), exercise()];
    w.exercises[1].id = w.exercises[0].id;
    expect(() => validateWallet(w)).toThrow("ID");
    const h = fixture();
    h.goal_history.push({ ...h.goal_history[0], id: "other" });
    expect(() => validateWallet(h)).toThrow("시작일");
  });
  it("rejects manipulated TDEE, exercise values and nonpositive targets", () => {
    const w = fixture();
    w.tdee_history[0].rest += 100;
    expect(() => validateWallet(w)).toThrow("TDEE");
    const e = fixture();
    e.exercises = [exercise({ calories: 1 })];
    expect(() => validateWallet(e)).toThrow("운동 계산");
    const g = fixture();
    g.tdee_history[0].rest = -1;
    expect(() => validateWallet(g)).toThrow();
  });
  it("requires manual BMR and non-overlapping 24-hour totals", () => {
    expect(
      bodySchema.safeParse({ ...fixture().profile!, basis: "manual" }).success,
    ).toBe(false);
    expect(
      lifestyleSchema.safeParse({
        ...fixture().profile!.lifestyle,
        sitting: 20,
        standing: 5,
      }).success,
    ).toBe(false);
  });
  it("supports unfinished body fields in drafts but not saved profiles", () => {
    const p = { ...fixture().profile!, age: null, height: null };
    const draft = draftProfileSchema.parse(p);
    expect(Number.isNaN(draft.age)).toBe(true);
    expect(bodySchema.safeParse(draft).success).toBe(false);
  });
});
