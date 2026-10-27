import {
  activityLevels,
  previousActivityLevels,
  type DailyActivity,
  type Lifestyle,
} from "./model";
import type {
  Body,
  Cycle,
  Exercise,
  ExerciseKind,
  Intensity,
  Meal,
  Profile,
  Tdee,
  Wallet,
} from "./model";
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
const ordinal = (date: string) => Date.parse(`${date}T00:00:00Z`) / 86400000;
export function datesBetween(start: string, end: string): string[] {
  const n = Math.max(0, ordinal(end) - ordinal(start) + 1);
  return Array.from({ length: n }, (_, i) => addDays(start, i));
}
export function effective<T extends { effectiveFrom: string }>(
  history: T[],
  date: string,
): T | undefined {
  return history
    .filter((x) => x.effectiveFrom <= date)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}
export function calculateBMR(body: Body): number {
  return body.basis === "manual"
    ? body.manualBmr!
    : 10 * body.weight +
        6.25 * body.height -
        5 * body.age +
        (body.basis === "male" ? 5 : -161);
}
// Representative MET values, simplified intensity buckets. Net cost excludes 1 MET rest.
const mets: Record<ExerciseKind, Record<Intensity, number>> = {
  running: { light: 6.5, moderate: 8.5, hard: 11 },
  walking: { light: 2.8, moderate: 3.8, hard: 4.8 },
  swimming: { light: 5.8, moderate: 8, hard: 9.8 },
  cycling: { light: 4, moderate: 7, hard: 10 },
  strength: { light: 3, moderate: 3.5, hard: 6 },
  // 2024 Adult Compendium walking codes 17081, 17080, 17036.
  // Map slow hiking / cross-country hiking / steep uphill to the app's intensity choices.
  // https://pacompendium.com/walking/
  hiking: { light: 3.8, moderate: 6, hard: 8.8 },
  other: { light: 2.5, moderate: 4, hard: 6 },
};
export function calculateExerciseCalories(
  kind: ExerciseKind,
  intensity: Intensity,
  minutes: number,
  weight: number,
  manual?: number,
): number {
  return (
    manual ??
    Math.max(0, (((mets[kind][intensity] - 1) * 3.5 * weight) / 200) * minutes)
  );
}
function estimateBaselineWalkingMinutes(l: Lifestyle): number {
  const stepEstimates = {
    exact: l.steps,
    under3000: 1500,
    "3000to5000": 4000,
    "5000to8000": 6500,
    "8000plus": 9000,
    unknown: 5000,
  } as const;
  const weekdaySteps = l.stepBand ? stepEstimates[l.stepBand] : l.steps;
  const directionalCommute = l.commuteOutMode !== undefined;
  const commuteWalkKm = directionalCommute
    ? (l.commuteOutMode === "walk" ? (l.commuteOutWalkKm ?? 0) : 0) +
      (l.commuteReturnMode === "walk" ? (l.commuteReturnWalkKm ?? 0) : 0)
    : (l.walkCommuteKm ?? 0);
  const commuteDays = directionalCommute
    ? (l.commuteDays ?? 0)
    : (l.walkCommuteDays ?? 5);
  const weekdayWalkMinutes = Math.max(
    weekdaySteps / 100,
    commuteWalkKm * 12 * (commuteDays / 5),
    directionalCommute
      ? 0
      : l.walkCommuteDays !== undefined
        ? (l.walkMinutes * l.walkCommuteDays) / 5
        : l.walkMinutes,
  );
  const weekendWalkMinutes = {
    sedentary: 0,
    light: 60,
    active: 120,
    veryActive: 180,
    unknown: 30,
  } as const;
  // Weekday step counts include walking commute, so use the larger estimate instead of adding twice.
  return l.stepBand !== undefined
    ? (weekdayWalkMinutes * 5 +
        (l.weekendActivity
          ? weekendWalkMinutes[l.weekendActivity]
          : l.walking * 60) *
          2) /
        7
    : Math.max(l.steps / 100, l.walking * 60, l.walkMinutes);
}
export function estimateDailyTDEE(
  profile: Profile,
  correction = 0,
): Omit<Tdee, "id" | "createdAt" | "updatedAt" | "effectiveFrom"> {
  const bmr = calculateBMR(profile),
    l = profile.lifestyle;
  const detailedNeat = l.stepBand !== undefined;
  const directionalCommute = l.commuteOutMode !== undefined;
  const walkingMinutes = estimateBaselineWalkingMinutes(l);
  const sittingHours = l.sittingBand
    ? {
        under5: 4,
        "5to6": 5.5,
        "7to8": 7.5,
        "9to10": 9.5,
        "10plus": 11,
        unknown: 8,
      }[l.sittingBand]
    : l.sitting;
  const averageSittingHours = detailedNeat
    ? (sittingHours * 5) / 7
    : sittingHours;
  const cyclingMinutes = directionalCommute
    ? (((l.commuteOutMode === "bike" ? (l.commuteOutBikeMinutes ?? 0) : 0) +
        (l.commuteReturnMode === "bike"
          ? (l.commuteReturnBikeMinutes ?? 0)
          : 0)) *
        (l.commuteDays ?? 0)) /
      7
    : l.bikeCommuteDays !== undefined
      ? (l.cycleMinutes * l.bikeCommuteDays) / 7
      : l.cycleMinutes;
  const nonExercise =
    bmr * 0.08 +
    profile.weight * (0.15 * averageSittingHours + 0.5 * l.standing) +
    calculateExerciseCalories(
      "walking",
      "light",
      walkingMinutes,
      profile.weight,
    ) +
    calculateExerciseCalories(
      "cycling",
      "light",
      cyclingMinutes,
      profile.weight,
    ) +
    calculateExerciseCalories("other", "light", l.otherMinutes, profile.weight);
  const weeklyExercise = profile.habits.reduce(
    (n, h) =>
      n +
      calculateExerciseCalories(
        h.kind,
        h.intensity,
        h.minutes,
        profile.weight,
      ) *
        h.sessions,
    0,
  );
  // TEF fixed from maintenance estimate; never added again when calculating daily totals.
  const tef = (bmr + nonExercise) / 9;
  const rest = bmr + nonExercise + tef + correction;
  const sessions = profile.habits.reduce((n, h) => n + h.sessions, 0);
  return {
    bmr,
    nonExercise,
    tef,
    rest,
    exerciseDay: rest + (sessions ? weeklyExercise / Math.min(7, sessions) : 0),
    average: rest + weeklyExercise / 7,
    weeklyExercise,
    correction,
    profile,
    method: "component-v1",
  };
}
export function calculateDailyIntake(meals: Meal[], date: string): number {
  return meals
    .filter((m) => m.date === date)
    .reduce((n, m) => n + m.calories, 0);
}
export function calculateDailyActivityAdjustment(
  tdee: Tdee,
  activity?: DailyActivity,
): number {
  const level = [...activityLevels, ...previousActivityLevels].find(
    (item) => item.value === activity?.movement,
  );
  const previousStepEstimates = {
    veryLow: 1500,
    low: 4500,
    moderate: 8000,
    high: 12500,
    veryHigh: 17500,
  } as const;
  const estimatedSteps =
    activity?.movement === "stepsExact"
      ? activity.steps
      : level
        ? level.estimate
        : activity?.movement && activity.movement in previousStepEstimates
          ? previousStepEstimates[
              activity.movement as keyof typeof previousStepEstimates
            ]
          : null;
  if (estimatedSteps === null) return 0; // Older time-based records were never applied to TDEE.
  const weight = tdee.profile.weight;
  const selectedWalking = calculateExerciseCalories(
    "walking",
    "light",
    estimatedSteps / 100,
    weight,
  );
  const baselineWalking = calculateExerciseCalories(
    "walking",
    "light",
    estimateBaselineWalkingMinutes(tdee.profile.lifestyle),
    weight,
  );
  return selectedWalking - baselineWalking;
}
export function calculateDailyExpenditure(
  tdee: Tdee,
  exercises: Exercise[],
  date: string,
  workedOut?: boolean,
  activity?: DailyActivity,
): number {
  const loggedThatDay = exercises.filter((e) => e.date === date);
  const legacyRegular =
    workedOut !== undefined
      ? 0
      : loggedThatDay
          .filter((e) => e.source === "regular")
          .reduce((n, e) => n + e.calories, 0);
  const additional = loggedThatDay
    .filter((e) => e.source === "extra")
    .reduce((n, e) => n + e.calories, 0);
  return (
    (workedOut === true ? tdee.exerciseDay : tdee.rest) +
    calculateDailyActivityAdjustment(tdee, activity) +
    legacyRegular +
    additional
  );
}
export const calculateDailyBalance = (intake: number, expenditure: number) =>
  intake - expenditure;
export const calculateRemainingCalories = (target: number, intake: number) =>
  target - intake;
export function daily(wallet: Wallet, date: string) {
  const tdee = effective(wallet.tdee_history, date),
    goal = effective(wallet.goal_history, date);
  if (!tdee || !goal) return null;
  const intake = calculateDailyIntake(wallet.meals, date),
    expenditure = calculateDailyExpenditure(
      tdee,
      wallet.exercises,
      date,
      wallet.meta.workoutStatus.find((item) => item.date === date)?.workedOut,
      wallet.meta.activityRecords.find((item) => item.date === date),
    ),
    target = expenditure + goal.balance;
  return {
    date,
    intake,
    expenditure,
    target,
    remaining: calculateRemainingCalories(target, intake),
    balance: calculateDailyBalance(intake, expenditure),
    goalBalance: goal.balance,
    // All dates in the tracked period count immediately, including days with no entries.
    complete: date >= wallet.meta.startedOn && date <= localDate(),
  };
}
export function getCycleDateRange(
  date: string,
  cycle: Cycle,
): { start: string; end: string } {
  if (cycle.kind === "daily") return { start: date, end: date };
  if (cycle.kind === "weekly") {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const start = addDays(date, -((weekday - cycle.weekday + 7) % 7));
    return { start, end: addDays(start, 6) };
  }
  const offset =
    Math.floor((ordinal(date) - ordinal(cycle.anchor)) / cycle.days) *
    cycle.days;
  const start = addDays(cycle.anchor, offset);
  return { start, end: addDays(start, cycle.days - 1) };
}
export function historicalCycle(wallet: Wallet, date: string) {
  const cycle = effective(wallet.cycle_history, date);
  if (!cycle) return null;
  const range = getCycleDateRange(date, cycle);
  const next = wallet.cycle_history
    .filter((c) => c.effectiveFrom > date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  return {
    start: [range.start, cycle.effectiveFrom, wallet.meta.startedOn]
      .sort()
      .at(-1)!,
    end:
      next && next.effectiveFrom <= range.end
        ? addDays(next.effectiveFrom, -1)
        : range.end,
  };
}
export function calculateCycleBalance(
  wallet: Wallet,
  start: string,
  end: string,
  today = localDate(),
) {
  const rows = datesBetween(start, end < today ? end : today)
    .map((date) => daily(wallet, date))
    .filter((r): r is NonNullable<ReturnType<typeof daily>> => r !== null);
  const complete = rows.filter((r) => r.complete);
  return {
    rows,
    completed: complete.length,
    pending: rows.length - complete.length,
    intake: complete.reduce((n, r) => n + r.intake, 0),
    expenditure: complete.reduce((n, r) => n + r.expenditure, 0),
    balance: complete.reduce((n, r) => n + r.balance, 0),
    goalBalance: complete.reduce((n, r) => n + r.goalBalance, 0),
  };
}
export const calculateTotalBalance = (wallet: Wallet, today = localDate()) =>
  calculateCycleBalance(wallet, wallet.meta.startedOn, today, today);
export function calculateRecordedBalance(
  wallet: Wallet,
  today = localDate(),
): number {
  const recordedDates = new Set([
    ...wallet.meals.map((item) => item.date),
    ...wallet.exercises.map((item) => item.date),
    ...wallet.meta.activityRecords.map((item) => item.date),
    ...wallet.meta.workoutStatus.map((item) => item.date),
  ]);
  return [...recordedDates]
    .filter((date) => date >= wallet.meta.startedOn && date <= today)
    .reduce((total, date) => total + (daily(wallet, date)?.balance ?? 0), 0);
}

// Personalized app progress, not a prediction of measured weight loss.
export function getLevelBaselineBmr(wallet: Wallet): number {
  // Recalculation appends history; keep the earliest baseline for stable levels.
  return [...wallet.tdee_history].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  )[0].bmr;
}
export function calculateCalorieLevel(
  balance: number,
  baselineBmr: number,
  startedOn: string,
  today = localDate(),
) {
  const deficit = Math.max(0, Math.round(-balance * 1e6) / 1e6);
  const caloriesPerLevel = baselineBmr * 5;
  const level = Math.floor(deficit / caloriesPerLevel);
  const progressCalories = deficit - level * caloriesPerLevel;
  return {
    level,
    caloriesPerLevel,
    estimatedKg: deficit / caloriesPerLevel,
    progressCalories,
    progressPercent: (progressCalories / caloriesPerLevel) * 100,
    remainingCalories: caloriesPerLevel - progressCalories,
    days: Math.max(0, ordinal(today) - ordinal(startedOn)),
  };
}
