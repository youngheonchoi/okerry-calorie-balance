import {
  emptyWallet,
  stamp,
  type Profile,
  type Wallet,
  type Exercise,
} from "../src/domain/model";
import { estimateDailyTDEE } from "../src/domain/calculations";
// Synthetic data is created only inside test processes, never seeded into the app.
export function fixture(): Wallet {
  const profile: Profile = {
    ...stamp(),
    basis: "male",
    age: 30,
    height: 175,
    weight: 70,
    lifestyle: {
      occupation: 0,
      workHours: 8,
      sitting: 8,
      standing: 2,
      walking: 1,
      steps: 6000,
      commute: "transit",
      walkMinutes: 60,
      cycleMinutes: 0,
      other: "",
      otherMinutes: 0,
    },
    habits: [
      { kind: "running", intensity: "moderate", sessions: 3, minutes: 30 },
    ],
  };
  const date = "2026-10-01",
    w = emptyWallet(date);
  return {
    ...w,
    profile,
    tdee_history: [
      { ...stamp(), effectiveFrom: date, ...estimateDailyTDEE(profile) },
    ],
    goal_history: [
      { ...stamp(), effectiveFrom: date, kind: "lose", balance: -300 },
    ],
    cycle_history: [
      {
        ...stamp(),
        effectiveFrom: date,
        kind: "weekly",
        weekday: 1,
        days: 7,
        anchor: date,
      },
    ],
    meta: { ...w.meta, initialized: true },
  };
}
export function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    ...stamp(),
    date: "2026-10-01",
    kind: "running",
    intensity: "moderate",
    minutes: 30,
    weight: 70,
    source: "regular",
    calories: 275.625,
    ...overrides,
  };
}
