import { useState } from "react";
import { Card, Icon, Metric } from "../components/ui";
import { datesBetween, effective, getCycleDateRange } from "../domain/calculations";
import { kcal } from "../domain/format";
import {
  activityLabel,
  exerciseLabels,
  mealLabels,
  type Wallet,
} from "../domain/model";

const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (value: number) => String(value).padStart(2, "0");

export default function Calendar({
  wallet,
  today,
}: {
  wallet: Wallet;
  today: string;
}) {
  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(today.slice(0, 7));
  const cycle = effective(wallet.cycle_history, today);
  const currentCycle = cycle ? getCycleDateRange(today, cycle) : null;
  const selectableDates = new Set([
    ...wallet.meta.activityRecords.map((item) => item.date),
    ...wallet.meals.map((item) => item.date),
    ...wallet.exercises.map((item) => item.date),
    ...(currentCycle ? datesBetween(currentCycle.start, currentCycle.end) : []),
  ]);
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

  return (
    <div className="calendar-page">
      <h1>캘린더</h1>
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
        <h2>활동</h2>
        {activity ? (
          <>
            <Metric
              label="일상 활동량"
              value={activityLabel(activity.movement)}
            />
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
        <h2>식단</h2>
        {meals.length === 0 ? (
          <p className="empty">식단 기록이 없어요.</p>
        ) : (
          meals.map((meal) => (
            <Metric
              key={meal.id}
              label={`${mealLabels[meal.type]} · ${meal.name}`}
              value={kcal(meal.calories)}
            />
          ))
        )}
      </Card>
      <Card>
        <h2>운동</h2>
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
    </div>
  );
}
