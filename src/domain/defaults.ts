import { localDate } from "./calculations";
import { stamp, type Cycle, type Goal } from "./model";
export const suggestedGoalBalances: Record<Goal["kind"], number> = {
  lose: -300,
  maintain: 0,
  gain: 300,
};
export const defaultCycle = (): Cycle => ({
  ...stamp(),
  effectiveFrom: localDate(),
  kind: "weekly",
  weekday: 1,
  anchor: localDate(),
  days: 7,
});
export const defaultGoal = (): Goal => ({
  ...stamp(),
  effectiveFrom: localDate(),
  kind: "maintain",
  balance: 0,
});
