import { balanceText, kcal, errorMessage } from "../domain/format";
import { useState } from "react";
import { Action, Card, Field, Metric, Modal } from "../components/ui";
import { effective, localDate } from "../domain/calculations";
import {
  goalLabels,
  stamp,
  type Cycle,
  type Goal,
  type Wallet,
} from "../domain/model";
import { cycleSchema, dateSchema, goalSchema } from "../domain/validation";
import { CycleFields, GoalFields } from "./Onboarding";
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
  const [edit, setEdit] = useState<
    "goal" | "cycle" | "start-date" | "reset" | null
  >(null);
  const [goal, setGoal] = useState<Goal>(currentGoal),
    [cycle, setCycle] = useState<Cycle>({
      ...currentCycle,
      kind: "weekly",
      days: 7,
    }),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [startDate, setStartDate] = useState(wallet.meta.startedOn),
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
          names.set(key, { name, calories: meal.calories });
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
      if (edit === "start-date") {
        const date = dateSchema.parse(startDate);
        if (date > today) throw new Error("오늘 이전 날짜를 선택해주세요");
        const withBaseline = <
          T extends {
            effectiveFrom: string;
            id: string;
            createdAt: string;
            updatedAt: string;
          },
        >(
          history: T[],
        ): T[] => {
          if (history.some((item) => item.effectiveFrom <= date))
            return history;
          const first = history
            .slice()
            .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
          return first
            ? [...history, { ...first, ...stamp(), effectiveFrom: date }]
            : history;
        };
        await save({
          ...wallet,
          tdee_history: withBaseline(wallet.tdee_history),
          goal_history: withBaseline(wallet.goal_history),
          cycle_history: withBaseline(wallet.cycle_history),
          meta: {
            ...wallet.meta,
            startedOn: date,
            completedDays: wallet.meta.completedDays.filter((d) => d >= date),
            updatedAt: new Date().toISOString(),
          },
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
            : edit === "cycle"
              ? "관리 주기를 오늘부터 적용했어요. 과거 기록 기준은 보존돼요."
              : "기록 시작일을 변경했어요",
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function open(kind: NonNullable<typeof edit>) {
    setError("");
    setMessage("");
    if (kind === "goal") setGoal(currentGoal);
    if (kind === "start-date") setStartDate(wallet.meta.startedOn);
    if (kind === "cycle") {
      const nextCycle = effective(wallet.cycle_history, today) ?? currentCycle;
      setCycle({ ...nextCycle, kind: "weekly", days: 7 });
    }
    setEdit(kind);
  }
  return (
    <>
      <h1>마이페이지</h1>
      <Card>
        <h2>내 정보</h2>
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
        <Metric label="설정 체중" value={`${profile.weight}kg`} />
        <Metric label="현재 BMR" value={kcal(currentTdee.bmr)} />
        <Metric label="비운동일 TDEE" value={kcal(currentTdee.rest)} />
        <Metric label="운동일 TDEE" value={kcal(currentTdee.exerciseDay)} />
        <Action secondary onClick={recalculate}>
          다시 계산하기
        </Action>
        <p className="hint">
          기존 입력을 불러오며, 새 결과는 내일부터 적용돼요.
        </p>
      </Card>
      <Card>
        <h2>식단 키워드 관리</h2>
        <p className="hint">
          이전 음식 선택 목록에서 자주 쓰지 않는 키워드를 삭제할 수 있어요.
        </p>
        <Action
          secondary
          onClick={() => {
            setKeywordError("");
            setKeywordsOpen(true);
          }}
        >
          키워드 관리
        </Action>
      </Card>
      <Card>
        <h2>나의 목표</h2>
        <Metric
          label={goalLabels[currentGoal.kind]}
          value={balanceText(currentGoal.balance)}
        />
        <Action secondary onClick={() => open("goal")}>
          목표 재설정
        </Action>
      </Card>
      <Card>
        <h2>관리 주기</h2>
        <Metric
          label="현재 주기"
          value={`매주 · ${["일", "월", "화", "수", "목", "금", "토"][currentCycle.weekday]}요일 시작`}
        />
        <Action secondary onClick={() => open("cycle")}>
          관리 주기 변경
        </Action>
      </Card>
      <Card>
        <h2>기록 시작일</h2>
        <Metric label="누적 통계 시작일" value={wallet.meta.startedOn} />
        <Action secondary onClick={() => open("start-date")}>
          시작일 변경
        </Action>
        <p className="hint">
          설정한 날짜부터 누적 통계를 계산해요. 과거 날짜를 기록하려면 먼저
          시작일을 변경해주세요.
        </p>
      </Card>
      <Card>
        <h2>데이터 초기화</h2>
        <p>기록은 이 기기에 저장돼요.</p>
        <div className="stack">
          <button
            className="danger-button"
            onClick={() => {
              setResetText("");
              open("reset");
            }}
          >
            모든 데이터 초기화
          </button>
        </div>
      </Card>
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
                : edit === "start-date"
                  ? "기록 시작일 변경"
                  : "모든 데이터를 초기화할까요?"
          }
          onClose={() => setEdit(null)}
        >
          {edit === "goal" && (
            <>
              <GoalFields goal={goal} onChange={setGoal} />
              {(currentTdee.rest + goal.balance < currentTdee.bmr ||
                Math.abs(goal.balance) > 500) && (
                <p className="warning">
                  목표 섭취량이 BMR보다 낮거나 조정 폭이 커요. 무리한 제한은
                  피해주세요.
                </p>
              )}
            </>
          )}
          {edit === "cycle" && (
            <CycleFields cycle={cycle} onChange={setCycle} weeklyOnly />
          )}
          {edit === "goal" && (
            <p className="notice">저장하면 오늘 기록부터 바로 적용돼요.</p>
          )}
          {edit === "cycle" && (
            <p className="notice">
              저장하면 오늘부터 적용해요. 과거 통계의 기준은 보존해요.
            </p>
          )}
          {edit === "start-date" && (
            <>
              <Field
                label="누적 통계 시작일"
                type="date"
                value={startDate}
                max={today}
                onChange={setStartDate}
              />
              <p className="notice">
                이 날짜부터 누적 통계에 포함하고, 이후 날짜의 식단·운동을 기록할
                수 있어요.
              </p>
            </>
          )}
          {edit === "reset" && (
            <>
              <p>
                신체 정보, 설정과 모든 기록을 이 기기에서 삭제해요. 삭제한
                데이터는 복구할 수 없어요.
              </p>
              <Field
                label="확인하려면 ‘초기화’를 입력해주세요"
                value={resetText}
                onChange={setResetText}
              />
            </>
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
            {busy
              ? "저장 중…"
              : edit === "reset"
                ? "모두 삭제하기"
                : "저장하기"}
          </Action>
        </Modal>
      )}
      {keywordsOpen && (
        <Modal
          title="식단 키워드 관리"
          onClose={() => setKeywordsOpen(false)}
        >
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
                <div className="food-keyword-row" key={normalizeFoodName(name)}>
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
                    삭제
                  </button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
