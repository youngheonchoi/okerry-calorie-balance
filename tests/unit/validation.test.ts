import { describe, expect, it } from "vitest";
import {
  bodySchema,
  dateSchema,
  draftProfileSchema,
  lifestyleSchema,
  validateWallet,
} from "../../src/domain/validation";
import { exercise, fixture } from "../fixtures";
describe("validation", () => {
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
    w.exercises = [exercise()];
    const migrated = validateWallet(w);
    expect(migrated.meta.workoutStatus).toMatchObject([
      { date: "2026-10-01", workedOut: true },
    ]);
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
