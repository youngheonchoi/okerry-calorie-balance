import { useId, useState } from "react";
import { IconButton } from "@toss/tds-mobile";
import { Action } from "../components/ui";
import { errorMessage } from "../domain/format";
import { localDate } from "../domain/calculations";
import {
  activityLevels,
  stamp,
  type ActivityLevel,
  type DailyActivity,
  type Wallet,
} from "../domain/model";

export default function Activity({
  wallet,
  today,
  save,
  busy,
}: {
  wallet: Wallet;
  today: string;
  save: (wallet: Wallet) => Promise<void>;
  busy: boolean;
}) {
  const recorded = wallet.meta.activityRecords.find(
    (item) => item.date === today,
  );
  const isToday = today === localDate();
  const selectedMovement =
    recorded?.movement === "steps12000to15000" ||
    recorded?.movement === "steps15000plus"
      ? "steps12000plus"
      : recorded?.movement;
  const [error, setError] = useState("");
  const [steps, setSteps] = useState(recorded?.steps ?? 5000);
  const stepsId = useId();
  const adjustSteps = (change: number) =>
    setSteps((current) =>
      Math.max(
        0,
        Math.min(
          100000,
          (Number.isFinite(current) ? Math.round(current) : 5000) + change,
        ),
      ),
    );
  const recordMatchesInput =
    recorded &&
    (recorded.movement !== "stepsExact" || recorded.steps === steps);

  async function saveActivity(
    movement: ActivityLevel | "stepsExact",
    exactSteps: number | null = null,
  ) {
    if (busy) return;
    if (
      movement === "stepsExact" &&
      (exactSteps === null ||
        !Number.isInteger(exactSteps) ||
        exactSteps < 0 ||
        exactSteps > 100000)
    ) {
      setError("걸음 수는 0~100,000 사이의 정수로 입력해주세요.");
      return;
    }
    if (recorded?.movement === movement && recorded.steps === exactSteps)
      return;
    const now = new Date().toISOString();
    const activity: DailyActivity = {
      ...(recorded ?? stamp()),
      date: today,
      steps: exactSteps,
      movement,
      updatedAt: now,
    };
    setError("");
    try {
      await save({
        ...wallet,
        meta: {
          ...wallet.meta,
          activityRecords: [
            ...wallet.meta.activityRecords.filter(
              (item) => item.date !== today,
            ),
            activity,
          ],
          updatedAt: now,
        },
      });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="activity-page">
      <h1>
        {isToday ? "오늘은 얼마나 움직였나요?" : "이날은 얼마나 움직였나요?"}
      </h1>
      <p className="activity-help">
        {isToday
          ? "운동을 제외하고, 오늘의 일상 활동량을 선택해 주세요."
          : "운동을 제외하고, 선택한 날짜의 일상 활동량을 선택해 주세요."}
      </p>
      <div className="activity-levels" role="group" aria-label="오늘의 활동량">
        {activityLevels.map((level) => (
          <button
            key={level.value}
            type="button"
            className="activity-level"
            aria-pressed={selectedMovement === level.value}
            disabled={busy}
            onClick={() => void saveActivity(level.value)}
          >
            <span className="activity-level-content">
              <span className="activity-level-name">{level.label}</span>
              <span className="activity-level-example">{level.example}</span>
            </span>
            <span className="activity-level-steps">{level.steps}</span>
          </button>
        ))}
      </div>
      <form
        className={`activity-steps-form${recorded?.movement === "stepsExact" ? " selected" : ""}`}
        aria-label="걸음 수 직접 입력"
        onSubmit={(event) => {
          event.preventDefault();
          void saveActivity("stepsExact", steps);
        }}
      >
        <div className="activity-steps-heading">
          <h2>걸음 수 직접 입력</h2>
          {recorded?.movement === "stepsExact" && (
            <span className="activity-level-selected">선택</span>
          )}
        </div>
        <div className="field body-number-field">
          <label htmlFor={stepsId}>일상 걸음 수 (보)</label>
          <div className="body-number-control">
            <IconButton
              type="button"
              name="icon-minus-mono"
              className="body-number-adjust"
              aria-label="걸음 수 500보 줄이기"
              disabled={busy || steps <= 0}
              onClick={() => adjustSteps(-500)}
            />
            <input
              id={stepsId}
              type="number"
              min={0}
              max={100000}
              step={1}
              value={Number.isNaN(steps) ? "" : steps}
              required
              disabled={busy}
              onChange={(event) =>
                setSteps(
                  event.target.value === "" ? NaN : Number(event.target.value),
                )
              }
            />
            <IconButton
              type="button"
              name="icon-plus-mono"
              className="body-number-adjust"
              aria-label="걸음 수 500보 늘리기"
              disabled={busy || steps >= 100000}
              onClick={() => adjustSteps(500)}
            />
          </div>
        </div>
        <Action type="submit" disabled={busy}>
          <span className="compact-action-label">
            {busy ? "저장 중…" : "기록하기"}
          </span>
        </Action>
      </form>
      <p className="activity-footnote">
        걸음 수는 참고용이에요. 정확히 몰라도 괜찮아요.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {recordMatchesInput && (
        <p role="status" className="activity-saved">
          {isToday
            ? "오늘 칼로리 잔고에 반영했어요."
            : "선택한 날짜의 칼로리 잔고에 반영했어요."}
        </p>
      )}
    </div>
  );
}
