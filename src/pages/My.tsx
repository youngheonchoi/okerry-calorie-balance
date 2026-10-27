import { kcal, errorMessage } from "../domain/format";
import { useState } from "react";
import { IconButton } from "@toss/tds-mobile";
import { adaptive } from "@toss/tds-colors";
import { Action, Card, Field, Metric, Modal } from "../components/ui";
import { effective, localDate } from "../domain/calculations";
import {
  goalLabels,
  stamp,
  type Cycle,
  type Goal,
  type Wallet,
} from "../domain/model";
import { cycleSchema, goalSchema } from "../domain/validation";
import { CycleFields, GoalFields } from "./Onboarding";
import CalorieLevelCard from "../components/CalorieLevelCard";
const normalizeFoodName = (name: string) => name.trim().toLocaleLowerCase();

export default function My({
  wallet,
  save,
  recalculate,
  reset,
  busy,
}: {
  wallet: Wallet;
  save: (w: Wallet) => Promise<void>;
  recalculate: () => void;
  reset: () => Promise<void>;
  busy: boolean;
}) {
  const today = localDate(),
    profile = effective(wallet.tdee_history, today)!.profile;
  const currentTdee = effective(wallet.tdee_history, today)!,
    currentGoal = effective(wallet.goal_history, today)!,
    currentCycle = effective(wallet.cycle_history, today)!;
  const [edit, setEdit] = useState<"goal" | "cycle" | "reset" | null>(null);
  const [goal, setGoal] = useState<Goal>(currentGoal),
    [cycle, setCycle] = useState<Cycle>({
      ...currentCycle,
      kind: "weekly",
      days: 7,
    }),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [resetText, setResetText] = useState("");
  const [keywordsOpen, setKeywordsOpen] = useState(false);
  const [keywordError, setKeywordError] = useState("");
  const hiddenKeywords = new Set(
    wallet.meta.hiddenFoodKeywords.map(normalizeFoodName),
  );
  const foodKeywords = Array.from(
    wallet.meals
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .reduce((names, meal) => {
        const name = meal.name.trim();
        const key = normalizeFoodName(name);
        if (!hiddenKeywords.has(key) && !names.has(key))
          names.set(key, {
            name,
            calories: meal.calories / (meal.quantity ?? 1),
          });
        return names;
      }, new Map<string, { name: string; calories: number }>())
      .values(),
  );
  async function hideFoodKeyword(name: string) {
    setKeywordError("");
    const key = normalizeFoodName(name);
    try {
      await save({
        ...wallet,
        meta: {
          ...wallet.meta,
          hiddenFoodKeywords: [
            ...wallet.meta.hiddenFoodKeywords.filter(
              (item) => normalizeFoodName(item) !== key,
            ),
            name,
          ],
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e) {
      setKeywordError(errorMessage(e));
    }
  }
  async function commit() {
    setError("");
    try {
      if (edit === "goal") {
        const item = goalSchema.parse({
          ...goal,
          ...stamp(),
          effectiveFrom: today,
        });
        if (currentTdee.rest + item.balance <= 0)
          throw new Error("목표 섭취량은 0kcal보다 커야 해요");
        await save({
          ...wallet,
          goal_history: [
            ...wallet.goal_history.filter((g) => g.effectiveFrom < today),
            item,
          ],
        });
      }
      if (edit === "cycle") {
        const item = cycleSchema.parse({
          ...cycle,
          kind: "weekly",
          days: 7,
          ...stamp(),
          effectiveFrom: today,
        });
        await save({
          ...wallet,
          cycle_history: [
            ...wallet.cycle_history.filter((c) => c.effectiveFrom < today),
            item,
          ],
        });
      }
      if (edit === "reset") {
        if (resetText !== "초기화") throw new Error("초기화를 입력해주세요");
        await reset();
      }
      setEdit(null);
      setMessage(
        edit === "reset"
          ? "초기화했어요"
          : edit === "goal"
            ? "목표를 오늘부터 적용했어요"
            : "관리 주기를 오늘부터 적용했어요. 과거 기록 기준은 보존돼요.",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function open(kind: NonNullable<typeof edit>) {
    setError("");
    setMessage("");
    if (kind === "goal") setGoal(currentGoal);
    if (kind === "cycle") {
      const nextCycle = effective(wallet.cycle_history, today) ?? currentCycle;
      setCycle({ ...nextCycle, kind: "weekly", days: 7 });
    }
    setEdit(kind);
  }
  return (
    <>
      <h1>마이페이지</h1>
      <CalorieLevelCard wallet={wallet} today={today} />
      <Card className="my-settings-card my-info-card">
        <div className="my-card-heading">
          <h2>내 정보</h2>
          <IconButton
            name="icon-setting-mono"
            color={adaptive.grey500}
            className="my-card-settings"
            aria-label="다시 계산하기"
            onClick={recalculate}
          />
        </div>
        <Metric
          label="계산 기준"
          value={
            profile.basis === "manual"
              ? "BMR 직접 입력"
              : profile.basis === "male"
                ? "남성 기준"
                : "여성 기준"
          }
        />
        <Metric
          label="나이 / 키"
          value={`${profile.age}세 / ${profile.height}cm`}
        />
        <Metric label="체중" value={`${profile.weight}kg`} />
        <Metric label="기초대사량" value={kcal(currentTdee.bmr)} />
      </Card>
      <Card className="my-settings-card my-keywords-card">
        <div className="my-card-heading">
          <h2>식단 키워드 관리</h2>
          <IconButton
            name="icon-setting-mono"
            color={adaptive.grey500}
            className="my-card-settings"
            aria-label="키워드 관리"
            onClick={() => {
              setKeywordError("");
              setKeywordsOpen(true);
            }}
          />
        </div>
        <p className="hint">
          이전 음식 선택 목록에서 자주 쓰지 않는 키워드를 삭제할 수 있어요.
        </p>
      </Card>
      <div className="my-settings-grid">
        <Card className="my-settings-card">
          <div className="my-card-heading">
            <h2>나의 목표</h2>
            <IconButton
              name="icon-setting-mono"
              color={adaptive.grey500}
              className="my-card-settings"
              aria-label="목표 재설정"
              onClick={() => open("goal")}
            />
          </div>
          <p className="my-setting-value">{goalLabels[currentGoal.kind]}</p>
        </Card>
        <Card className="my-settings-card">
          <div className="my-card-heading">
            <h2>관리 주기</h2>
            <IconButton
              name="icon-setting-mono"
              color={adaptive.grey500}
              className="my-card-settings"
              aria-label="관리 주기 변경"
              onClick={() => open("cycle")}
            />
          </div>
          <p className="my-setting-value">
            매주 ·{" "}
            {["일", "월", "화", "수", "목", "금", "토"][currentCycle.weekday]}
            요일 시작
          </p>
        </Card>
      </div>
      <button
        type="button"
        className="danger-button"
        onClick={() => {
          setResetText("");
          open("reset");
        }}
      >
        모든 데이터 초기화
      </button>
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {error && !edit && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {edit && (
        <Modal
          title={
            edit === "goal"
              ? "목표 재설정"
              : edit === "cycle"
                ? "관리 주기 변경"
                : "모든 데이터를 초기화할까요?"
          }
          onClose={() => setEdit(null)}
        >
          {edit === "goal" && (
            <div className="goal-settings-dialog">
              <GoalFields goal={goal} onChange={setGoal} />
              {(currentTdee.rest + goal.balance < currentTdee.bmr ||
                Math.abs(goal.balance) > 500) && (
                <p className="warning">
                  목표 섭취량이 BMR보다 낮거나 조정 폭이 커요. 무리한 제한은
                  피해주세요.
                </p>
              )}
            </div>
          )}
          {edit === "cycle" && (
            <div className="goal-settings-dialog">
              <CycleFields cycle={cycle} onChange={setCycle} weeklyOnly />
            </div>
          )}
          {edit === "goal" && (
            <p className="notice">저장하면 오늘 기록부터 바로 적용돼요.</p>
          )}
          {edit === "cycle" && (
            <p className="notice">
              저장하면 오늘부터 적용해요. 과거 통계의 기준은 보존해요.
            </p>
          )}
          {edit === "reset" && (
            <div className="goal-settings-dialog reset-settings-dialog">
              <p>
                신체 정보, 설정과 모든 기록을 이 기기에서 삭제해요. 삭제한
                데이터는 복구할 수 없어요.
              </p>
              <Field
                label="확인하려면 ‘초기화’를 입력해주세요"
                value={resetText}
                onChange={setResetText}
              />
            </div>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <Action
            disabled={busy || (edit === "reset" && resetText !== "초기화")}
            onClick={() => void commit()}
          >
            {busy ? "저장 중…" : edit === "reset" ? "모두 삭제하기" : "저장"}
          </Action>
        </Modal>
      )}
      {keywordsOpen && (
        <Modal title="식단 키워드 관리" onClose={() => setKeywordsOpen(false)}>
          <div className="food-keyword-dialog">
            <p className="hint">
              목록에서 삭제해도 기존 식단 기록은 그대로 유지돼요.
            </p>
            {keywordError && (
              <p role="alert" className="error">
                {keywordError}
              </p>
            )}
            {foodKeywords.length === 0 ? (
              <p className="empty">관리할 음식 키워드가 없어요.</p>
            ) : (
              <div className="food-keyword-list">
                {foodKeywords.map(({ name, calories }) => (
                  <div
                    className="food-keyword-row"
                    key={normalizeFoodName(name)}
                  >
                    <div className="food-keyword-info">
                      <span>
                        {name} - {kcal(calories).replace(" ", "")}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="food-keyword-delete"
                      disabled={busy}
                      onClick={() => void hideFoodKeyword(name)}
                    >
                      <span className="food-keyword-delete-label">삭제</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
