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
  stepBand?:
    | "exact"
    | "under3000"
    | "3000to5000"
    | "5000to8000"
    | "8000plus"
    | "unknown";
  sittingBand?: "under5" | "5to6" | "7to8" | "9to10" | "10plus" | "unknown";
  walkCommuteDays?: number;
  bikeCommuteDays?: number;
  walkCommuteKm?: number;
  commuteDays?: number;
  commuteOutMode?: "walk" | "bike" | "other";
  commuteReturnMode?: "walk" | "bike" | "other";
  commuteOutWalkKm?: number;
  commuteReturnWalkKm?: number;
  commuteOutBikeMinutes?: number;
  commuteReturnBikeMinutes?: number;
  weekendActivity?: "sedentary" | "light" | "active" | "veryActive" | "unknown";
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
export type WorkoutStatus = Stamp & { date: DateKey; workedOut: boolean };
export const activityLevels = [
  {
    value: "steps0to3000",
    label: "거의 없음",
    steps: "0~3,000보 미만",
    estimate: 1500,
  },
  {
    value: "steps3000to6000",
    label: "적음",
    steps: "3,000~6,000보 미만",
    estimate: 4500,
  },
  {
    value: "steps6000to9000",
    label: "보통",
    steps: "6,000~9,000보 미만",
    estimate: 7500,
  },
  {
    value: "steps9000to12000",
    label: "조금 많음",
    steps: "9,000~12,000보 미만",
    estimate: 10500,
  },
  {
    value: "steps12000to15000",
    label: "많음",
    steps: "12,000~15,000보 미만",
    estimate: 13500,
  },
  {
    value: "steps15000plus",
    label: "매우 많음",
    steps: "15,000보 이상",
    estimate: 16500,
  },
] as const;
export const previousActivityLevels = [
  {
    value: "steps0to2000",
    label: "거의 없음",
    steps: "0~2,000보 미만",
    estimate: 1000,
  },
  {
    value: "steps2000to4000",
    label: "적음",
    steps: "2,000~4,000보 미만",
    estimate: 3000,
  },
  {
    value: "steps4000to6000",
    label: "적음",
    steps: "4,000~6,000보 미만",
    estimate: 5000,
  },
  {
    value: "steps6000to8000",
    label: "보통",
    steps: "6,000~8,000보 미만",
    estimate: 7000,
  },
  {
    value: "steps8000to10000",
    label: "보통",
    steps: "8,000~10,000보 미만",
    estimate: 9000,
  },
  {
    value: "steps10000to12000",
    label: "많음",
    steps: "10,000~12,000보 미만",
    estimate: 11000,
  },
  {
    value: "steps12000to14000",
    label: "많음",
    steps: "12,000~14,000보 미만",
    estimate: 13000,
  },
  {
    value: "steps14000to16000",
    label: "매우 많음",
    steps: "14,000~16,000보 미만",
    estimate: 15000,
  },
  {
    value: "steps16000plus",
    label: "매우 많음",
    steps: "16,000보 이상",
    estimate: 17000,
  },
] as const;
export type ActivityLevel = (typeof activityLevels)[number]["value"];
export type DailyActivity = Stamp & {
  date: DateKey;
  steps: number | null;
  movement:
    | ActivityLevel
    | (typeof previousActivityLevels)[number]["value"]
    | "veryLow"
    | "low"
    | "moderate"
    | "high"
    | "veryHigh"
    | "none"
    | "oneToTwo"
    | "threePlus";
};
export function activityLabel(movement: DailyActivity["movement"]): string {
  const level = [...activityLevels, ...previousActivityLevels].find(
    (item) => item.value === movement,
  );
  if (level) return level.steps;
  return {
    veryLow: "거의 없음",
    low: "적음",
    moderate: "보통",
    high: "많음",
    veryHigh: "매우 많음",
    none: "거의 없음",
    oneToTwo: "1~2시간",
    threePlus: "3시간 이상",
  }[
    movement as Exclude<
      DailyActivity["movement"],
      ActivityLevel | (typeof previousActivityLevels)[number]["value"]
    >
  ];
}
export type Meta = Stamp & {
  startedOn: DateKey;
  completedDays: DateKey[];
  workoutStatus: WorkoutStatus[];
  activityRecords: DailyActivity[];
  hiddenFoodKeywords: string[];
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
      workoutStatus: [],
      activityRecords: [],
      hiddenFoodKeywords: [],
      initialized: false,
    },
  };
}
