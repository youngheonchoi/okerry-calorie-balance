import { useState } from "react";
import { IconButton } from "@toss/tds-mobile";
import { adaptive } from "@toss/tds-colors";
import { Action, Card, Icon, Metric, Modal } from "../components/ui";
import {
  calculateRecordedBalance,
  datesBetween,
  effective,
  getCycleDateRange,
} from "../domain/calculations";
import { errorMessage, kcal } from "../domain/format";
import Activity from "./Activity";
import Records from "./Records";
import {
  activityLabel,
  activityLevels,
  exerciseLabels,
  mealLabels,
  type Wallet,
} from "../domain/model";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (value: number) => String(value).padStart(2, "0");
const editorLabels = { activity: "활동", meal: "식단", exercise: "운동" };

export default function Calendar({
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
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7));
  const [editor, setEditor] = useState<keyof typeof editorLabels | null>(null);
  const [deletingActivity, setDeletingActivity] = useState(false);
  const [editError, setEditError] = useState("");
  const recordedBalance = calculateRecordedBalance(wallet, today);
  const cycle = effective(wallet.cycle_history, today);
  const cycleRange = cycle ? getCycleDateRange(today, cycle) : null;
  const selectableDates = new Set(
    [
      today,
      ...(cycleRange ? datesBetween(cycleRange.start, cycleRange.end) : []),
      ...wallet.meta.activityRecords.map((item) => item.date),
      ...wallet.meals.map((item) => item.date),
      ...wallet.exercises.map((item) => item.date),
      ...wallet.meta.workoutStatus.map((item) => item.date),
      ...wallet.weights.map((item) => item.date),
    ].filter((date) => date <= today),
  );
  const selectableMonths = [
    ...new Set([...selectableDates].map((date) => date.slice(0, 7))),
  ].sort();
  const monthIndex = selectableMonths.indexOf(visibleMonth);
  const [year, month] = visibleMonth.split("-").map(Number);
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const activity = wallet.meta.activityRecords.find(
    (item) => item.date === selectedDate,
  );
  const activityLevel = activityLevels.find(
    (level) =>
      level.value ===
      (activity?.movement === "steps12000to15000" ||
      activity?.movement === "steps15000plus"
        ? "steps12000plus"
        : activity?.movement),
  );
  const meals = wallet.meals.filter((item) => item.date === selectedDate);
  const exercises = wallet.exercises.filter(
    (item) => item.date === selectedDate,
  );

  function changeMonth(offset: number) {
    const nextMonth = selectableMonths[monthIndex + offset];
    if (!nextMonth) return;
    setVisibleMonth(nextMonth);
    const dates = [...selectableDates].filter((date) =>
      date.startsWith(nextMonth),
    );
    setSelectedDate(dates.includes(today) ? today : dates.sort().at(-1)!);
  }
  function openEditor(kind: keyof typeof editorLabels) {
    setEditError("");
    setEditor(kind);
  }
  async function removeActivity() {
    if (busy) return;
    setEditError("");
    try {
      await save({
        ...wallet,
        meta: {
          ...wallet.meta,
          activityRecords: wallet.meta.activityRecords.filter(
            (item) => item.date !== selectedDate,
          ),
          updatedAt: new Date().toISOString(),
        },
      });
      setDeletingActivity(false);
      setEditor(null);
    } catch (cause) {
      setEditError(errorMessage(cause));
    }
  }

  return (
    <div className="calendar-page">
      <h1>달력</h1>
      <section
        className="calendar-balance-summary"
        aria-label="칼로리 잔고 요약"
      >
        <Metric
          label="총 누적 칼로리 잔고"
          value={kcal(recordedBalance).replace(" ", "")}
        />
      </section>
      <div className="calendar-month-heading">
        <button
          type="button"
          aria-label="이전 달"
          disabled={monthIndex <= 0}
          onClick={() => changeMonth(-1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <h2>
          {new Date(`${visibleMonth}-01T12:00:00`).toLocaleDateString("ko-KR", {
            year: "numeric",
            month: "long",
          })}
        </h2>
        <button
          type="button"
          aria-label="다음 달"
          disabled={monthIndex >= selectableMonths.length - 1}
          onClick={() => changeMonth(1)}
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="calendar-grid-wrap">
        <div className="calendar-weekdays" aria-hidden="true">
          {weekdays.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid" aria-label="날짜 선택">
          {Array.from({ length: firstWeekday }, (_, index) => (
            <span key={`blank-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const day = index + 1;
            const date = `${visibleMonth}-${pad(day)}`;
            const hasActivity = wallet.meta.activityRecords.some(
              (item) => item.date === date,
            );
            const hasMeal = wallet.meals.some((item) => item.date === date);
            const hasExercise = wallet.exercises.some(
              (item) => item.date === date,
            );
            const recordTypes = [
              hasActivity && "활동",
              hasMeal && "식단",
              hasExercise && "운동",
            ].filter(Boolean);
            return (
              <button
                key={date}
                type="button"
                className={`calendar-day${date === selectedDate ? " selected" : ""}`}
                aria-label={`${month}월 ${day}일, ${recordTypes.length ? `${recordTypes.join("·")} 기록` : "기록 없음"}`}
                aria-pressed={date === selectedDate}
                disabled={!selectableDates.has(date)}
                onClick={() => setSelectedDate(date)}
              >
                <span>{day}</span>
                {recordTypes.length > 0 && (
                  <span className="calendar-markers" aria-hidden="true">
                    {hasActivity && (
                      <span className="calendar-marker activity" />
                    )}
                    {hasMeal && <span className="calendar-marker meal" />}
                    {hasExercise && (
                      <span className="calendar-marker exercise" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="calendar-legend" aria-label="기록 점 색상">
          <span>
            <i className="calendar-marker activity" />
            활동
          </span>
          <span>
            <i className="calendar-marker meal" />
            식단
          </span>
          <span>
            <i className="calendar-marker exercise" />
            운동
          </span>
        </div>
      </div>
      <h2 className="calendar-selected-heading">
        {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8))}일
        기록
      </h2>
      <Card>
        <div className="calendar-record-heading">
          <h2>활동</h2>
          <IconButton
            name="icon-pencil-mono"
            color={adaptive.grey500}
            className="calendar-record-edit"
            aria-label="활동 기록 수정"
            iconSize={18}
            disabled={busy || selectedDate > today}
            onClick={() => openEditor("activity")}
          />
        </div>
        {activity ? (
          <>
            <p className="calendar-activity-name">
              {activityLevel?.label ??
                (activity.movement === "stepsExact"
                  ? "걸음 수 직접 입력"
                  : activityLabel(activity.movement))}
            </p>
            {activity.steps === null && activityLevel && (
              <Metric label="참고 걸음 수" value={activityLevel.steps} />
            )}
            {activity.steps !== null && (
              <Metric
                label="기록한 걸음 수"
                value={`${activity.steps.toLocaleString("ko-KR")}걸음`}
              />
            )}
          </>
        ) : (
          <p className="empty">활동 기록이 없어요.</p>
        )}
      </Card>
      <Card>
        <div className="calendar-record-heading">
          <h2>식단</h2>
          <IconButton
            name="icon-pencil-mono"
            color={adaptive.grey500}
            className="calendar-record-edit"
            aria-label="식단 기록 수정"
            iconSize={18}
            disabled={busy || selectedDate > today}
            onClick={() => openEditor("meal")}
          />
        </div>
        {Object.entries(mealLabels).map(([type, label]) => (
          <section
            className="calendar-meal-group"
            key={type}
            aria-label={label}
          >
            <h3>{label}</h3>
            {!meals.some((meal) => meal.type === type) && (
              <p className="empty">기록이 없어요.</p>
            )}
            {meals
              .filter((meal) => meal.type === type)
              .map((meal) => (
                <div className="calendar-meal-row" key={meal.id}>
                  <span className="calendar-meal-name">{meal.name}</span>
                  <span className="calendar-meal-quantity">
                    {meal.quantity ?? 1}EA
                  </span>
                  <span className="calendar-meal-calories">
                    {kcal(meal.calories).replace(" ", "")}
                  </span>
                </div>
              ))}
          </section>
        ))}
      </Card>
      <Card>
        <div className="calendar-record-heading">
          <h2>운동</h2>
          <IconButton
            name="icon-pencil-mono"
            color={adaptive.grey500}
            className="calendar-record-edit"
            aria-label="운동 기록 수정"
            iconSize={18}
            disabled={busy || selectedDate > today}
            onClick={() => openEditor("exercise")}
          />
        </div>
        {exercises.length === 0 ? (
          <p className="empty">운동 기록이 없어요.</p>
        ) : (
          exercises.map((exercise) => (
            <Metric
              key={exercise.id}
              label={`${exerciseLabels[exercise.kind]} · ${exercise.minutes}분`}
              value={kcal(exercise.calories)}
            />
          ))
        )}
      </Card>
      {editor && (
        <Modal
          title={`${selectedDate} ${editorLabels[editor]} 기록`}
          onClose={() => setEditor(null)}
        >
          <div
            className={`calendar-record-editor${editor === "activity" ? " calendar-activity-editor" : ""}`}
          >
            <p className="hint">선택한 날짜의 기록에 바로 반영돼요.</p>
            {editor === "activity" ? (
              <>
                <Activity
                  key={selectedDate}
                  wallet={wallet}
                  today={selectedDate}
                  save={save}
                  busy={busy}
                />
                <div className="calendar-activity-actions">
                  <button
                    type="button"
                    className="danger-button"
                    disabled={busy || !activity}
                    onClick={() => {
                      setEditError("");
                      setDeletingActivity(true);
                    }}
                  >
                    기록 삭제
                  </button>
                  <Action disabled={busy} onClick={() => setEditor(null)}>
                    닫기
                  </Action>
                </div>
              </>
            ) : (
              <Records
                key={`${selectedDate}-${editor}`}
                wallet={wallet}
                kind={editor}
                date={selectedDate}
                save={save}
                busy={busy}
              />
            )}
            {editError && !deletingActivity && (
              <p className="error" role="alert">
                {editError}
              </p>
            )}
          </div>
        </Modal>
      )}
      {deletingActivity && (
        <Modal
          title="활동 기록을 삭제할까요?"
          onClose={() => setDeletingActivity(false)}
        >
          <p className="record-delete-description">
            {selectedDate}의 활동 기록을 삭제하고 해당 날짜의 칼로리 잔고에
            반영해요.
          </p>
          {editError && (
            <p className="error" role="alert">
              {editError}
            </p>
          )}
          <Action disabled={busy} onClick={() => void removeActivity()}>
            삭제하기
          </Action>
        </Modal>
      )}
    </div>
  );
}
