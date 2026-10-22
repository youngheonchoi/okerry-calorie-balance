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
export function estimateDailyTDEE(
  profile: Profile,
  correction = 0,
): Omit<Tdee, "id" | "createdAt" | "updatedAt" | "effectiveFrom"> {
  const bmr = calculateBMR(profile),
    l = profile.lifestyle;
  // All walking inputs describe the same daily walking pool: take the maximum, never sum.
  const walkingMinutes = Math.max(l.steps / 100, l.walking * 60, l.walkMinutes);
  const nonExercise =
    bmr * 0.08 +
    profile.weight * (0.15 * l.sitting + 0.5 * l.standing) +
    calculateExerciseCalories(
      "walking",
      "light",
      walkingMinutes,
      profile.weight,
    ) +
    calculateExerciseCalories(
      "cycling",
      "light",
      l.cycleMinutes,
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
export function calculateDailyExpenditure(
  tdee: Tdee,
  exercises: Exercise[],
  date: string,
): number {
  return (
    tdee.rest +
    exercises
      .filter((e) => e.date === date && e.source !== "daily")
      .reduce((n, e) => n + e.calories, 0)
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
    expenditure = calculateDailyExpenditure(tdee, wallet.exercises, date),
    target = expenditure + goal.balance;
  return {
    date,
    intake,
    expenditure,
    target,
    remaining: calculateRemainingCalories(target, intake),
    balance: calculateDailyBalance(intake, expenditure),
    goalBalance: goal.balance,
    complete: wallet.meta.completedDays.includes(date),
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
