import { useState } from "react";
import { Card } from "../components/ui";
import { errorMessage } from "../domain/format";
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
  const [error, setError] = useState("");

  async function saveActivity(movement: ActivityLevel) {
    if (busy || recorded?.movement === movement) return;
    const now = new Date().toISOString();
    const activity: DailyActivity = {
      ...(recorded ?? stamp()),
      date: today,
      steps: null,
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
    <>
      <h1>오늘의 활동</h1>
      <p className="subtitle">
        {new Date(`${today}T12:00:00`).toLocaleDateString("ko-KR", {
          month: "long",
          day: "numeric",
          weekday: "long",
        })}
      </p>
      <Card>
        <h2>오늘의 운동을 제외하고 얼마나 움직였나요?</h2>
        <p className="activity-help">
          걷기와 일상 움직임을 떠올려 선택해 주세요. 걸음 수는 대략적인
          기준이며, 선택한 활동량은 오늘 칼로리 잔고에 반영돼요.
        </p>
        <div
          className="activity-levels"
          role="group"
          aria-label="오늘의 활동량"
        >
          {activityLevels.map((level) => (
            <button
              key={level.value}
              type="button"
              className="activity-level"
              aria-pressed={recorded?.movement === level.value}
              disabled={busy}
              onClick={() => void saveActivity(level.value)}
            >
              <span className="activity-level-name">{level.steps}</span>
              {recorded?.movement === level.value && (
                <span className="activity-level-selected">선택됨</span>
              )}
            </button>
          ))}
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {recorded && (
          <p role="status" className="activity-saved">
            오늘 칼로리 잔고에 반영했어요.
          </p>
        )}
      </Card>
    </>
  );
}
