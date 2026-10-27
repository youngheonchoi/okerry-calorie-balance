import { kcal, errorMessage } from "../domain/format";
import { useEffect, useState } from "react";
import { IconButton } from "@toss/tds-mobile";
import { adaptive } from "@toss/tds-colors";
import { Action, Field, Metric, Modal, Select } from "../components/ui";
import {
  calculateExerciseCalories,
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
const unitCalories = (meal: Pick<Meal, "calories" | "quantity">) =>
  meal.calories / (meal.quantity ?? 1);
const foodOptionValue = (meal: Pick<Meal, "name" | "calories" | "quantity">) =>
  `${normalizeFoodName(meal.name)}::${unitCalories(meal)}`;
const normalizeFoodName = (name: string) => name.trim().toLocaleLowerCase();
export default function Records({
  wallet,
  kind,
  date,
  mealType,
  save,
  busy,
}: {
  wallet: Wallet;
  kind: "meal" | "exercise";
  date: string;
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
  const canRecord = date <= today;
  useEffect(() => {
    if (kind === "meal" && mealType)
      document
        .getElementById(`meal-${mealType}`)
        ?.scrollIntoView({ block: "start" });
  }, [kind, mealType, date]);
  const newMeal = (type: MealType) => {
    setError("");
    setMealPreset("manual");
    setMeal({
      ...stamp(),
      date,
      type,
      name: "",
      calories: NaN,
      quantity: 1,
      memo: "",
    });
  };
  const adjustMealQuantity = (change: number) => {
    setMeal((current) => {
      if (!current) return null;
      const quantity = Number.isInteger(current.quantity)
        ? (current.quantity ?? 1)
        : 1;
      return {
        ...current,
        quantity: Math.max(1, Math.min(999, quantity + change)),
      };
    });
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
          calories: meal.calories * (meal.quantity ?? 1),
          updatedAt: new Date().toISOString(),
        });
        await save({
          ...wallet,
          meals: [...wallet.meals.filter((m) => m.id !== item.id), item],
          meta: {
            ...wallet.meta,
            hiddenFoodKeywords: wallet.meta.hiddenFoodKeywords.filter(
              (name) =>
                normalizeFoodName(name) !== normalizeFoodName(item.name),
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
  return (
    <>
      <h1>{kind === "meal" ? "무엇을 드셨나요?" : "어떻게 움직였나요?"}</h1>
      {!canRecord && (
        <p className="notice">오늘 이후 날짜는 기록할 수 없어요.</p>
      )}
      {kind === "meal" ? (
        Object.entries(mealLabels).map(([type, label]) => (
          <section
            key={type}
            id={`meal-${type}`}
            className="meal-record-section"
            aria-labelledby={`meal-heading-${type}`}
          >
            <div className="section-heading">
              <h2 id={`meal-heading-${type}`}>{label}</h2>
              <IconButton
                type="button"
                name="icon-plus-mono"
                color={adaptive.grey500}
                className="meal-add-button"
                aria-label={`${label} 추가`}
                disabled={!canRecord || busy}
                onClick={() => newMeal(type as MealType)}
              />
            </div>
            {meals.filter((m) => m.type === type).length === 0 && (
              <p className="empty">아직 기록이 없어요</p>
            )}
            {meals
              .filter((m) => m.type === type)
              .map((m) => (
                <div className="record meal-record-row" key={m.id}>
                  <div className="meal-record-badge">
                    <span className="meal-record-name" title={m.name}>
                      {m.name}
                    </span>
                    <span className="meal-record-quantity">
                      {m.quantity ?? 1} EA
                    </span>
                    <span className="meal-record-calories">
                      {kcal(m.calories)}
                    </span>
                  </div>
                  <div className="record-actions">
                    <button
                      onClick={() => {
                        setError("");
                        setMealPreset("manual");
                        setMeal({
                          ...m,
                          calories: unitCalories(m),
                          quantity: m.quantity ?? 1,
                        });
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
          </section>
        ))
      ) : (
        <section
          className="exercise-record-section"
          aria-labelledby="exercise-record-heading"
        >
          <div className="section-heading">
            <h2 id="exercise-record-heading">운동 내역</h2>
            <IconButton
              type="button"
              name="icon-plus-mono"
              color={adaptive.grey500}
              className="exercise-add-button"
              aria-label="운동 기록 추가"
              disabled={!canRecord || busy}
              onClick={newExercise}
            />
          </div>
          {exercises.length === 0 && (
            <p className="empty">운동한 내역을 기록해보세요.</p>
          )}
          {exercises.map((e) => (
            <div className="record exercise-record-row" key={e.id}>
              <div className="exercise-record-badge">
                <span
                  className="exercise-record-name"
                  title={`${exerciseLabels[e.kind]}${e.distance !== undefined ? ` · ${e.distance}km` : ""}`}
                >
                  {exerciseLabels[e.kind]}
                </span>
                <span className="exercise-record-duration">{e.minutes}분</span>
                <span className="exercise-record-calories">
                  {kcal(e.calories)}
                </span>
              </div>
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
        </section>
      )}
      {meal && (
        <Modal
          title="음식 기록"
          onClose={() => {
            if (!busy) setMeal(null);
          }}
        >
          <form
            className="meal-record-form"
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
                      calories: unitCalories(selected),
                    });
                }}
                options={{
                  manual: "직접 입력",
                  ...Object.fromEntries(
                    previousFoods.map((item) => [
                      foodOptionValue(item),
                      `${item.name} · ${kcal(unitCalories(item))}`,
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
            <p className="hint">칼로리는 1개 기준으로 입력해주세요.</p>
            <div className="field body-number-field">
              <label htmlFor="meal-quantity">개수</label>
              <div className="body-number-control">
                <IconButton
                  type="button"
                  name="icon-minus-mono"
                  className="body-number-adjust"
                  aria-label="개수 줄이기"
                  disabled={busy || (meal.quantity ?? 1) <= 1}
                  onClick={() => adjustMealQuantity(-1)}
                />
                <input
                  id="meal-quantity"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  required
                  disabled={busy}
                  value={
                    Number.isNaN(meal.quantity) ? "" : (meal.quantity ?? 1)
                  }
                  onChange={(event) =>
                    setMeal({
                      ...meal,
                      quantity:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
                <IconButton
                  type="button"
                  name="icon-plus-mono"
                  className="body-number-adjust"
                  aria-label="개수 늘리기"
                  disabled={busy || (meal.quantity ?? 1) >= 999}
                  onClick={() => adjustMealQuantity(1)}
                />
              </div>
            </div>
            <Metric
              label="총 칼로리"
              value={kcal(
                Number.isFinite(meal.calories) &&
                  Number.isFinite(meal.quantity ?? 1)
                  ? meal.calories * (meal.quantity ?? 1)
                  : 0,
              )}
            />
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <div className="meal-form-actions">
              <Action type="submit" disabled={busy}>
                저장하기
              </Action>
            </div>
          </form>
        </Modal>
      )}
      {exercise && (
        <Modal
          title="운동 기록"
          onClose={() => {
            if (!busy) setExercise(null);
          }}
        >
          <form
            className="exercise-record-form"
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
              options={Object.fromEntries(
                Object.entries(exerciseLabels).filter(
                  ([kind]) => kind !== "other" || exercise.kind === "other",
                ),
              )}
            />
            <div className="field body-number-field">
              <label htmlFor="exercise-minutes">운동 시간 (분)</label>
              <div className="body-number-control">
                <IconButton
                  type="button"
                  name="icon-minus-mono"
                  className="body-number-adjust"
                  aria-label="운동 시간 줄이기"
                  disabled={busy || exercise.minutes <= 1}
                  onClick={() =>
                    setExercise(
                      (current) =>
                        current && {
                          ...current,
                          minutes: Math.max(
                            1,
                            (Number.isFinite(current.minutes)
                              ? current.minutes
                              : 30) - 1,
                          ),
                        },
                    )
                  }
                />
                <input
                  id="exercise-minutes"
                  type="number"
                  min={1}
                  max={1440}
                  step={1}
                  required
                  disabled={busy}
                  value={Number.isNaN(exercise.minutes) ? "" : exercise.minutes}
                  onChange={(event) =>
                    setExercise({
                      ...exercise,
                      minutes:
                        event.target.value === ""
                          ? NaN
                          : Number(event.target.value),
                    })
                  }
                />
                <IconButton
                  type="button"
                  name="icon-plus-mono"
                  className="body-number-adjust"
                  aria-label="운동 시간 늘리기"
                  disabled={busy || exercise.minutes >= 1440}
                  onClick={() =>
                    setExercise(
                      (current) =>
                        current && {
                          ...current,
                          minutes: Math.min(
                            1440,
                            (Number.isFinite(current.minutes)
                              ? current.minutes
                              : 30) + 1,
                          ),
                        },
                    )
                  }
                />
              </div>
            </div>
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
            <div className="meal-form-actions">
              <Action type="submit" disabled={busy}>
                저장하기
              </Action>
            </div>
          </form>
        </Modal>
      )}
      {deletion && (
        <Modal title="이 기록을 삭제할까요?" onClose={() => setDeletion(null)}>
          <p className="record-delete-description">
            삭제한 기록은 해당 날짜와 누적 잔고에 바로 반영돼요.
          </p>
          {error && <p role="alert">{error}</p>}
          <Action disabled={busy} onClick={() => void remove()}>
            삭제하기
          </Action>
        </Modal>
      )}
    </>
  );
}
