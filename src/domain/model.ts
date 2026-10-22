export type DateKey = string;
export type Stamp = { id: string; createdAt: string; updatedAt: string };
export type Basis = "male" | "female" | "manual";
export type ExerciseKind =
  "running" | "walking" | "swimming" | "cycling" | "strength" | "other";
export type Intensity = "light" | "moderate" | "hard";
export type Habit = {
  kind: ExerciseKind;
  sessions: number;
  minutes: number;
  intensity: Intensity;
  distance?: number;
  pace?: number;
};
export type Body = {
  basis: Basis;
  age: number;
  height: number;
  weight: number;
  manualBmr?: number;
};
export type Lifestyle = {
  occupation: number;
  workHours: number;
  sitting: number;
  standing: number;
  walking: number;
  steps: number;
  commute: string;
  walkMinutes: number;
  cycleMinutes: number;
  other: string;
  otherMinutes: number;
};
export type Profile = Stamp & Body & { lifestyle: Lifestyle; habits: Habit[] };
export type Tdee = Stamp & {
  effectiveFrom: DateKey;
  bmr: number;
  nonExercise: number;
  tef: number;
  rest: number;
  exerciseDay: number;
  average: number;
  weeklyExercise: number;
  correction: number;
  profile: Profile;
  method: "component-v1";
};
export type Goal = Stamp & {
  effectiveFrom: DateKey;
  kind: "lose" | "maintain" | "gain";
  balance: number;
};
export type Cycle = Stamp & {
  effectiveFrom: DateKey;
  kind: "daily" | "weekly" | "custom";
  weekday: number;
  anchor: DateKey;
  days: number;
};
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type Meal = Stamp & {
  date: DateKey;
  type: MealType;
  name: string;
  calories: number;
  memo: string;
};
export type Exercise = Stamp & {
  date: DateKey;
  kind: ExerciseKind;
  minutes: number;
  intensity: Intensity;
  distance?: number;
  manualCalories?: number;
  calories: number;
  source: "regular" | "extra" | "daily";
  weight: number;
};
export type Weight = Stamp & { date: DateKey; weight: number };
export type Meta = Stamp & {
  startedOn: DateKey;
  completedDays: DateKey[];
  initialized: boolean;
};
export type Wallet = {
  schemaVersion: 1;
  profile: Profile | null;
  tdee_history: Tdee[];
  goal_history: Goal[];
  cycle_history: Cycle[];
  meals: Meal[];
  exercises: Exercise[];
  weights: Weight[];
  meta: Meta;
};
export const mealLabels: Record<MealType, string> = {
  breakfast: "아침",
  lunch: "점심",
  dinner: "저녁",
  snack: "간식",
};
export const exerciseLabels: Record<ExerciseKind, string> = {
  running: "러닝",
  walking: "걷기",
  swimming: "수영",
  cycling: "자전거",
  strength: "근력운동",
  other: "기타",
};
export const goalLabels = {
  lose: "체중 감량",
  maintain: "체중 유지",
  gain: "체중 증가",
};
export function stamp(): Stamp {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now };
}
export function emptyWallet(date: string): Wallet {
  return {
    schemaVersion: 1,
    profile: null,
    tdee_history: [],
    goal_history: [],
    cycle_history: [],
    meals: [],
    exercises: [],
    weights: [],
    meta: {
      ...stamp(),
      startedOn: date,
      completedDays: [],
      initialized: false,
    },
  };
}
