import { z } from "zod";
import type { Wallet } from "./model";
import {
  calculateExerciseCalories,
  effective,
  estimateDailyTDEE,
  localDate,
} from "./calculations";
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(s + "T12:00:00Z");
    return (
      !isNaN(d.getTime()) &&
      d.toISOString().slice(0, 10) === s &&
      s >= "1900-01-01" &&
      s <= "2200-12-31"
    );
  }, "올바른 날짜를 입력해주세요");
const stampSchema = {
  id: z.string().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
};
const kind = z.enum([
  "running",
  "walking",
  "swimming",
  "cycling",
  "strength",
  "other",
]);
const intensity = z.enum(["light", "moderate", "hard"]);
export const bodySchema = z
  .object({
    basis: z.enum(["male", "female", "manual"]),
    age: num(18, 110).int(),
    height: num(100, 250),
    weight: num(25, 350),
    manualBmr: num(500, 5000).optional(),
  })
  .refine(
    (b) => b.basis !== "manual" || b.manualBmr !== undefined,
    "수동 BMR을 입력해주세요",
  );
export const lifestyleSchema = z
  .object({
    occupation: num(0, 3).int(),
    workHours: num(0, 24),
    sitting: num(0, 24),
    standing: num(0, 24),
    walking: num(0, 24),
    steps: num(0, 100000).int(),
    commute: z.string().max(40),
    walkMinutes: num(0, 1440),
    cycleMinutes: num(0, 1440),
    other: z.string().max(200),
    otherMinutes: num(0, 1440),
    stepBand: z
      .enum([
        "exact",
        "under3000",
        "3000to5000",
        "5000to8000",
        "8000plus",
        "unknown",
      ])
      .optional(),
    sittingBand: z
      .enum(["under5", "5to6", "7to8", "9to10", "10plus", "unknown"])
      .optional(),
    walkCommuteDays: num(0, 7).int().optional(),
    bikeCommuteDays: num(0, 7).int().optional(),
    walkCommuteKm: num(0, 100).optional(),
    commuteDays: num(0, 7).int().optional(),
    commuteOutMode: z.enum(["walk", "bike", "other"]).optional(),
    commuteReturnMode: z.enum(["walk", "bike", "other"]).optional(),
    commuteOutWalkKm: num(0, 100).optional(),
    commuteReturnWalkKm: num(0, 100).optional(),
    commuteOutBikeMinutes: num(0, 300).optional(),
    commuteReturnBikeMinutes: num(0, 300).optional(),
    weekendActivity: z
      .enum(["sedentary", "light", "active", "veryActive", "unknown"])
      .optional(),
  })
  .refine(
    (l) =>
      l.sitting +
        l.standing +
        Math.max(l.walking, l.walkMinutes / 60, l.steps / 6000) +
        l.cycleMinutes / 60 +
        l.otherMinutes / 60 <=
      24,
    "겹치지 않는 하루 활동 시간을 24시간 이내로 입력해주세요",
  );
export const neatAnswersSchema = z.object({
  stepBand: z.enum(["under3000", "3000to5000", "5000to8000", "8000plus"]),
  sittingBand: z.enum(["under5", "5to6", "7to8", "9to10", "10plus"]),
  commuteDays: num(0, 7).int(),
  commuteOutMode: z.enum(["walk", "bike", "other"]),
  commuteReturnMode: z.enum(["walk", "bike", "other"]),
  commuteOutWalkKm: num(0, 100).optional(),
  commuteReturnWalkKm: num(0, 100).optional(),
  commuteOutBikeMinutes: num(0, 300).optional(),
  commuteReturnBikeMinutes: num(0, 300).optional(),
  weekendActivity: z.enum(["sedentary", "light", "active", "veryActive"]),
});
const habit = z.object({
  kind,
  sessions: num(1, 21).int(),
  minutes: num(1, 600),
  intensity,
  distance: num(0, 500).optional(),
  pace: num(1, 60).optional(),
});
export const profileSchema = z
  .object({
    ...stampSchema,
    ...bodySchema.shape,
    lifestyle: lifestyleSchema,
    habits: z.array(habit).max(6),
  })
  .refine(
    (p) => p.basis !== "manual" || p.manualBmr !== undefined,
    "수동 BMR을 입력해주세요",
  )
  .refine(
    (p) => new Set(p.habits.map((h) => h.kind)).size === p.habits.length,
    "운동 종류가 중복돼요",
  );
const draftNumber = z
  .number()
  .nullable()
  .transform((value) => value ?? NaN);
export const draftProfileSchema = z.object({
  ...profileSchema.shape,
  age: draftNumber,
  height: draftNumber,
  weight: draftNumber,
  manualBmr: draftNumber.optional(),
  lifestyle: z.object(lifestyleSchema.shape),
  habits: z
    .array(
      z.object({ ...habit.shape, sessions: draftNumber, minutes: draftNumber }),
    )
    .max(6),
});
const historyStamp = { ...stampSchema, effectiveFrom: dateSchema };
const tdee = z.object({
  ...historyStamp,
  bmr: num(100, 6000),
  nonExercise: num(0, 30000),
  tef: num(0, 6000),
  rest: num(500, 30000),
  exerciseDay: num(500, 50000),
  average: num(500, 50000),
  weeklyExercise: num(0, 150000),
  correction: num(-2000, 2000),
  profile: profileSchema,
  method: z.literal("component-v1"),
});
export const goalSchema = z
  .object({
    ...historyStamp,
    kind: z.enum(["lose", "maintain", "gain"]),
    balance: num(-1500, 1500),
  })
  .refine(
    (g) =>
      (g.kind === "lose" && g.balance <= 0) ||
      (g.kind === "maintain" && g.balance === 0) ||
      (g.kind === "gain" && g.balance >= 0),
    "목표 종류와 적자·흑자 값이 맞지 않아요",
  );
export const cycleSchema = z.object({
  ...historyStamp,
  kind: z.enum(["daily", "weekly", "custom"]),
  weekday: num(0, 6).int(),
  anchor: dateSchema,
  days: num(1, 365).int(),
});
export const mealSchema = z.object({
  ...stampSchema,
  date: dateSchema,
  type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  name: z.string().trim().min(1).max(100),
  calories: num(0, 10000),
  memo: z.string().max(300),
});
export const exerciseSchema = z.object({
  ...stampSchema,
  date: dateSchema,
  kind,
  minutes: num(1, 1440),
  intensity,
  distance: num(0, 1000).optional(),
  manualCalories: num(0, 20000).optional(),
  calories: num(0, 20000),
  source: z.enum(["regular", "extra", "daily"]),
  weight: num(25, 350),
});
const walletSchema = z.object({
  schemaVersion: z.literal(1),
  profile: profileSchema.nullable(),
  tdee_history: z.array(tdee),
  goal_history: z.array(goalSchema),
  cycle_history: z.array(cycleSchema),
  meals: z.array(mealSchema).max(100000),
  exercises: z.array(exerciseSchema).max(100000),
  weights: z.array(
    z.object({ ...stampSchema, date: dateSchema, weight: num(25, 350) }),
  ),
  meta: z.object({
    ...stampSchema,
    startedOn: dateSchema,
    completedDays: z.array(dateSchema),
    workoutStatus: z
      .array(
        z.object({ ...stampSchema, date: dateSchema, workedOut: z.boolean() }),
      )
      .default([]),
    activityRecords: z
      .array(
        z.object({
          ...stampSchema,
          date: dateSchema,
          steps: num(0, 100000).int().nullable(),
          movement: z.enum([
            "none",
            "oneToTwo",
            "threePlus",
            "veryLow",
            "low",
            "moderate",
            "high",
            "veryHigh",
            "steps0to2000",
            "steps2000to4000",
            "steps4000to6000",
            "steps6000to8000",
            "steps8000to10000",
            "steps10000to12000",
            "steps12000to14000",
            "steps14000to16000",
            "steps16000plus",
            "steps0to3000",
            "steps3000to6000",
            "steps6000to9000",
            "steps9000to12000",
            "steps12000to15000",
            "steps15000plus",
          ]),
        }),
      )
      .max(100000)
      .default([]),
    hiddenFoodKeywords: z.array(z.string().trim().min(1).max(100)).default([]),
    initialized: z.boolean(),
  }),
});
export function validateWallet(input: unknown): Wallet {
  const parsed = walletSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      `데이터를 확인해주세요: ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join(".")} ${i.message}`)
        .join(" / ")}`,
    );
  const w = parsed.data;
  const rawMeta =
    typeof input === "object" && input !== null && "meta" in input
      ? (input as { meta?: { workoutStatus?: unknown } }).meta
      : undefined;
  if (!Array.isArray(rawMeta?.workoutStatus)) {
    const legacyStatuses = new Map<string, (typeof w.exercises)[number]>();
    for (const exercise of w.exercises)
      if (exercise.source === "regular")
        legacyStatuses.set(exercise.date, exercise);
    w.meta.workoutStatus = [...legacyStatuses.entries()].map(
      ([date, exercise]) => ({
        id: exercise.id,
        createdAt: exercise.createdAt,
        updatedAt: exercise.updatedAt,
        date,
        workedOut: true,
      }),
    );
  }
  for (const list of [
    w.tdee_history,
    w.goal_history,
    w.cycle_history,
    w.meals,
    w.exercises,
    w.weights,
  ])
    if (new Set(list.map((x) => x.id)).size !== list.length)
      throw new Error("중복된 기록 ID가 있어요");
  for (const list of [w.tdee_history, w.goal_history, w.cycle_history])
    if (new Set(list.map((x) => x.effectiveFrom)).size !== list.length)
      throw new Error("설정 적용 시작일이 중복돼요");
  if (
    w.meta.initialized &&
    (!w.profile ||
      !w.tdee_history.some((x) => x.effectiveFrom <= w.meta.startedOn) ||
      !w.goal_history.some((x) => x.effectiveFrom <= w.meta.startedOn) ||
      !w.cycle_history.some((x) => x.effectiveFrom <= w.meta.startedOn))
  )
    throw new Error("필수 사용자 설정 또는 최초 계산 이력이 누락됐어요");
  if (w.meta.completedDays.some((d) => d < w.meta.startedOn))
    throw new Error("기록 시작일보다 이전인 완료 날짜가 있어요");
  if (
    w.meta.startedOn > localDate() ||
    [...w.meals, ...w.exercises, ...w.weights].some(
      (x) => x.date > localDate(),
    ) ||
    w.meta.workoutStatus.some((x) => x.date > localDate()) ||
    w.meta.activityRecords.some((x) => x.date > localDate()) ||
    w.meta.completedDays.some((d) => d > localDate())
  )
    throw new Error("미래 날짜의 기록은 가져올 수 없어요");
  if (new Set(w.meta.completedDays).size !== w.meta.completedDays.length)
    throw new Error("기록 완료 날짜가 중복돼요");
  if (
    new Set(w.meta.workoutStatus.map((item) => item.date)).size !==
    w.meta.workoutStatus.length
  )
    throw new Error("운동 여부 기록 날짜가 중복돼요");
  if (
    new Set(w.meta.activityRecords.map((item) => item.date)).size !==
    w.meta.activityRecords.length
  )
    throw new Error("활동 기록 날짜가 중복돼요");
  for (const t of w.tdee_history) {
    const computed = estimateDailyTDEE(t.profile, t.correction);
    for (const field of [
      "bmr",
      "nonExercise",
      "tef",
      "rest",
      "exerciseDay",
      "average",
      "weeklyExercise",
    ] as const)
      if (Math.abs(computed[field] - t[field]) > 0.01)
        throw new Error("TDEE 계산 결과와 신체·활동 정보가 일치하지 않아요");
  }
  for (const e of w.exercises)
    if (
      Math.abs(
        calculateExerciseCalories(
          e.kind,
          e.intensity,
          e.minutes,
          e.weight,
          e.manualCalories,
        ) - e.calories,
      ) > 0.01
    )
      throw new Error("운동 계산 결과가 기록과 일치하지 않아요");
  if (w.meta.initialized)
    for (const day of [
      w.meta.startedOn,
      ...w.tdee_history.map((t) => t.effectiveFrom),
      ...w.goal_history.map((g) => g.effectiveFrom),
    ]) {
      if (day < w.meta.startedOn) continue;
      const t = effective(w.tdee_history, day),
        g = effective(w.goal_history, day);
      if (!t || !g || t.rest + g.balance <= 0)
        throw new Error("설정 이력의 목표 섭취량은 0kcal보다 커야 해요");
    }
  return w;
}
