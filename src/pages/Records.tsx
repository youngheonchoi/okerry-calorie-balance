import { kcal, errorMessage } from "../domain/format";
import { useEffect, useState } from "react";
import { Action, Card, Field, Metric, Modal, Select } from "../components/ui";
import {
  calculateExerciseCalories,
  getCycleDateRange,
  effective,
  localDate,
} from "../domain/calculations";
import {
  exerciseLabels,
  mealLabels,
  stamp,
  type Exercise,
  type Meal,
  type MealType,
  type Wallet,
} from "../domain/model";
import { exerciseSchema, mealSchema } from "../domain/validation";
const foodOptionValue = (meal: Pick<Meal, "name" | "calories">) =>
  `${normalizeFoodName(meal.name)}::${meal.calories}`;
const normalizeFoodName = (name: string) => name.trim().toLocaleLowerCase();
export default function Records({
  wallet,
  kind,
  date,
  setDate,
  mealType,
  save,
  busy,
}: {
  wallet: Wallet;
  kind: "meal" | "exercise";
  date: string;
  setDate: (d: string) => void;
  mealType?: MealType;
  save: (w: Wallet) => Promise<void>;
  busy: boolean;
}) {
  const [meal, setMeal] = useState<Meal | null>(null),
    [mealPreset, setMealPreset] = useState("manual"),
    [exercise, setExercise] = useState<Exercise | null>(null),
    [error, setError] = useState(""),
    [deletion, setDeletion] = useState<{
      kind: "meal" | "exercise";
      id: string;
    } | null>(null);
  const meals = wallet.meals.filter((m) => m.date === date),
    exercises = wallet.exercises.filter((e) => e.date === date);
  const hiddenFoodKeywords = new Set(
    wallet.meta.hiddenFoodKeywords.map(normalizeFoodName),
  );
  const previousFoods = Array.from(
    wallet.meals
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .reduce((foods, item) => {
        const key = foodOptionValue(item);
        if (
          !hiddenFoodKeywords.has(normalizeFoodName(item.name)) &&
          !foods.has(key)
        )
          foods.set(key, item);
        return foods;
      }, new Map<string, Meal>())
      .values(),
  );
  const today = localDate();
  const cycle =
    effective(wallet.cycle_history, date) ??
    wallet.cycle_history
      .slice()
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
  const cycleRange = cycle
    ? getCycleDateRange(date, { ...cycle, kind: "weekly", days: 7 })
    : { start: date, end: date };
  const canRecord = date <= today;
  const workoutStatus = wallet.meta.workoutStatus.find(
    (item) => item.date === date,
  );
  useEffect(() => {
    if (date < wallet.meta.startedOn) setDate(wallet.meta.startedOn);
  }, [date, setDate, wallet.meta.startedOn]);
  useEffect(() => {
    if (kind === "meal" && mealType)
      document
        .getElementById(`meal-${mealType}`)
        ?.scrollIntoView({ block: "start" });
  }, [kind, mealType, date]);
  const newMeal = (type: MealType) => {
    setError("");
    setMealPreset("manual");
    setMeal({ ...stamp(), date, type, name: "", calories: NaN, memo: "" });
  };
  const newExercise = () => {
    setError("");
    setExercise({
      ...stamp(),
      date,
      kind: "walking",
      minutes: 30,
      intensity: "moderate",
      source: "extra",
      calories: 0,
      weight:
        effective(wallet.tdee_history, date)?.profile.weight ??
        wallet.profile!.weight,
    });
  };
  async function commit() {
    setError("");
    try {
      if (meal) {
        const item = mealSchema.parse({
          ...meal,
          name: meal.name.trim(),
          updatedAt: new Date().toISOString(),
        });
        await save({
          ...wallet,
          meals: [...wallet.meals.filter((m) => m.id !== item.id), item],
          meta: {
            ...wallet.meta,
            hiddenFoodKeywords: wallet.meta.hiddenFoodKeywords.filter(
              (name) => normalizeFoodName(name) !== normalizeFoodName(item.name),
            ),
            updatedAt: new Date().toISOString(),
          },
        });
        setMeal(null);
      }
      if (exercise) {
        const item = exerciseSchema.parse({
          ...exercise,
          calories: calculateExerciseCalories(
            exercise.kind,
            exercise.intensity,
            exercise.minutes,
            exercise.weight,
            exercise.manualCalories,
          ),
          updatedAt: new Date().toISOString(),
        });
        await save({
          ...wallet,
          exercises: [
            ...wallet.exercises.filter((e) => e.id !== item.id),
            item,
          ],
          meta: {
            ...wallet.meta,
            updatedAt: new Date().toISOString(),
          },
        });
        setExercise(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function remove() {
    if (!deletion) return;
    try {
      await save({
        ...wallet,
        meals:
          deletion.kind === "meal"
            ? wallet.meals.filter((m) => m.id !== deletion.id)
            : wallet.meals,
        exercises:
          deletion.kind === "exercise"
            ? wallet.exercises.filter((e) => e.id !== deletion.id)
            : wallet.exercises,
        meta: {
          ...wallet.meta,
          updatedAt: new Date().toISOString(),
        },
      });
      setDeletion(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function setWorkoutStatus(workedOut: boolean) {
    setError("");
    const now = new Date().toISOString();
    const previous = wallet.meta.workoutStatus.find(
      (item) => item.date === date,
    );
    const status = previous
      ? { ...previous, workedOut, updatedAt: now }
      : { ...stamp(), date, workedOut };
    try {
      await save({
        ...wallet,
        meta: {
          ...wallet.meta,
          workoutStatus: [
            ...wallet.meta.workoutStatus.filter((item) => item.date !== date),
            status,
          ],
          updatedAt: now,
        },
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <>
      <h1>{kind === "meal" ? "무엇을 드셨나요?" : "어떻게 움직였나요?"}</h1>
      <Field
        label="기록 날짜"
        type="date"
        value={date}
        min={
          cycleRange.start < wallet.meta.startedOn
            ? wallet.meta.startedOn
            : cycleRange.start
        }
        max={cycleRange.end}
        onChange={(v) => {
          if (v) setDate(v);
        }}
      />
      <p className="hint">
        이번 관리 주기: {cycleRange.start} ~ {cycleRange.end}
      </p>
      {!canRecord && (
        <p className="notice">오늘 이후 날짜는 기록할 수 없어요.</p>
      )}
      {kind === "meal" ? (
        Object.entries(mealLabels).map(([type, label]) => (
          <Card key={type} id={`meal-${type}`}>
            <div className="section-heading">
              <h2>{label}</h2>
              <span>
                {kcal(
                  meals
                    .filter((m) => m.type === type)
                    .reduce((n, m) => n + m.calories, 0),
                )}
              </span>
            </div>
            {meals.filter((m) => m.type === type).length === 0 && (
              <p className="empty">아직 기록이 없어요</p>
            )}
            {meals
              .filter((m) => m.type === type)
              .map((m) => (
                <div className="record" key={m.id}>
                  <Metric label={m.name} value={kcal(m.calories)} />
                  {m.memo && <p>{m.memo}</p>}
                  <div className="record-actions">
                    <button
                      onClick={() => {
                        setError("");
                    setMealPreset("manual");
                        setMeal(m);
                      }}
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeletion({ kind: "meal", id: m.id })}
                    >
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            <Action
              secondary
              disabled={!canRecord || busy}
              onClick={() => newMeal(type as MealType)}
            >
              {label} 추가
            </Action>
          </Card>
        ))
      ) : (
        <>
          <Card>
            <h2>설정한 운동 루틴을 진행하셨나요?</h2>
            <p className="hint">
              처음 계산 때 설정한 운동 습관을 말해요. 추가로 한 운동은 아래에
              따로 기록할 수 있어요.
            </p>
            <div className="choices" role="group" aria-label="정기 운동 여부">
              <button
                type="button"
                className={`choice${workoutStatus?.workedOut === true ? " selected" : ""}`}
                aria-pressed={workoutStatus?.workedOut === true}
                disabled={!canRecord || busy}
                onClick={() => void setWorkoutStatus(true)}
              >
                운동했어요
              </button>
              <button
                type="button"
                className={`choice${workoutStatus?.workedOut === false ? " selected" : ""}`}
                aria-pressed={workoutStatus?.workedOut === false}
                disabled={!canRecord || busy}
                onClick={() => void setWorkoutStatus(false)}
              >
                운동 안 했어요
              </button>
            </div>
          </Card>
          <Card>
            <h2>추가 운동 내역</h2>
            {exercises.length === 0 && (
              <p className="empty">추가로 한 운동이 있으면 기록해보세요.</p>
            )}
            {exercises.map((e) => (
              <div className="record" key={e.id}>
                <Metric
                  label={exerciseLabels[e.kind]}
                  value={kcal(e.calories)}
                />
                <p>
                  {e.minutes}분 ·{" "}
                  {e.source === "daily"
                    ? "일상 활동에 포함"
                    : e.source === "regular"
                      ? "기존 정기 운동 기록"
                      : "추가 운동"}
                  {e.distance !== undefined ? ` · ${e.distance}km` : ""}
                </p>
                <div className="record-actions">
                  <button
                    onClick={() => {
                      setError("");
                      setExercise(e);
                    }}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => setDeletion({ kind: "exercise", id: e.id })}
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
            <Action disabled={!canRecord || busy} onClick={newExercise}>
              추가 운동 기록
            </Action>
          </Card>
        </>
      )}
      {meal && (
        <Modal title="음식 기록" onClose={() => setMeal(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commit();
            }}
          >
            <Select
              label="식사 유형"
              value={meal.type}
              onChange={(v) => setMeal({ ...meal, type: v as MealType })}
              options={mealLabels}
            />
            {previousFoods.length > 0 && (
              <Select
                label="음식 선택"
                value={mealPreset}
                onChange={(value) => {
                  setMealPreset(value);
                  if (value === "manual") {
                    if (mealPreset !== "manual")
                      setMeal({ ...meal, name: "", calories: NaN });
                    return;
                  }
                  const selected = previousFoods.find(
                    (item) => foodOptionValue(item) === value,
                  );
                  if (selected)
                    setMeal({
                      ...meal,
                      name: selected.name,
                      calories: selected.calories,
                    });
                }}
                options={{
                  manual: "직접 입력",
                  ...Object.fromEntries(
                    previousFoods.map((item) => [
                      foodOptionValue(item),
                      `${item.name} · ${kcal(item.calories)}`,
                    ]),
                  ),
                }}
              />
            )}
            <Field
              label="음식 이름"
              required
              value={meal.name}
              onChange={(v) => setMeal({ ...meal, name: v })}
            />
            <Field
              label="칼로리 (kcal)"
              type="number"
              required
              min={0}
              max={10000}
              value={meal.calories}
              onChange={(v) =>
                setMeal({ ...meal, calories: v === "" ? NaN : Number(v) })
              }
            />
            <Field
              label="섭취량 또는 메모 (선택)"
              value={meal.memo}
              onChange={(v) => setMeal({ ...meal, memo: v })}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Action type="submit" disabled={busy}>
              저장하기
            </Action>
          </form>
        </Modal>
      )}
      {exercise && (
        <Modal title="운동 기록" onClose={() => setExercise(null)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void commit();
            }}
          >
            <Select
              label="운동 종류"
              value={exercise.kind}
              onChange={(v) =>
                setExercise({ ...exercise, kind: v as Exercise["kind"] })
              }
              options={exerciseLabels}
            />
            <Field
              label="운동 시간 (분)"
              type="number"
              required
              min={1}
              max={1440}
              value={exercise.minutes}
              onChange={(v) =>
                setExercise({
                  ...exercise,
                  minutes: v === "" ? NaN : Number(v),
                })
              }
            />
            <Select
              label="운동 강도"
              value={exercise.intensity}
              onChange={(v) =>
                setExercise({
                  ...exercise,
                  intensity: v as Exercise["intensity"],
                })
              }
              options={{ light: "가볍게", moderate: "보통", hard: "격하게" }}
            />
            <Field
              label="거리 (km, 선택)"
              type="number"
              step="0.1"
              min={0}
              value={exercise.distance ?? ""}
              onChange={(v) =>
                setExercise({
                  ...exercise,
                  distance: v === "" ? undefined : Number(v),
                })
              }
            />
            <Field
              label="추가 소비량 직접 입력 (kcal, 선택)"
              type="number"
              min={0}
              max={20000}
              value={exercise.manualCalories ?? ""}
              onChange={(v) =>
                setExercise({
                  ...exercise,
                  manualCalories: v === "" ? undefined : Number(v),
                })
              }
            />
            <p className="hint">
              직접 입력 시 안정 시 소비량을 제외한 값으로 입력해주세요. 거리
              대신 시간과 강도로 계산해요.
            </p>
            <Metric
              label="예상 순소비량"
              value={kcal(
                calculateExerciseCalories(
                  exercise.kind,
                  exercise.intensity,
                  exercise.minutes,
                  exercise.weight,
                  exercise.manualCalories,
                ),
              )}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Action type="submit" disabled={busy}>
              저장하기
            </Action>
          </form>
        </Modal>
      )}
      {deletion && (
        <Modal title="이 기록을 삭제할까요?" onClose={() => setDeletion(null)}>
          <p>삭제한 기록은 해당 날짜와 누적 잔고에 바로 반영돼요.</p>
          {error && <p role="alert">{error}</p>}
          <Action disabled={busy} onClick={() => void remove()}>
            삭제하기
          </Action>
        </Modal>
      )}
    </>
  );
}
