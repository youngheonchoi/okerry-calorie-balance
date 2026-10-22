import { balanceText, kcal, errorMessage } from "../domain/format";
import { useState } from "react";
import { Action, Card, Field, Metric, Modal } from "../components/ui";
import { addDays, effective, localDate } from "../domain/calculations";
import {
  goalLabels,
  stamp,
  type Cycle,
  type Goal,
  type Wallet,
} from "../domain/model";
import { cycleSchema, goalSchema } from "../domain/validation";
import { exportBackup } from "../data/sdk";
import { CycleFields, GoalFields } from "./Onboarding";

export default function My({
  wallet,
  save,
  recalculate,
  importData,
  reset,
  busy,
}: {
  wallet: Wallet;
  save: (w: Wallet) => Promise<void>;
  recalculate: () => void;
  importData: () => void;
  reset: () => Promise<void>;
  busy: boolean;
}) {
  const today = localDate(),
    tomorrow = addDays(today, 1),
    profile = effective(wallet.tdee_history, today)!.profile;
  const currentTdee = effective(wallet.tdee_history, today)!,
    currentGoal = effective(wallet.goal_history, today)!,
    currentCycle = effective(wallet.cycle_history, today)!;
  const [edit, setEdit] = useState<
    "goal" | "cycle" | "reset" | "weight" | null
  >(null);
  const [goal, setGoal] = useState<Goal>(currentGoal),
    [cycle, setCycle] = useState<Cycle>(currentCycle),
    [weight, setWeight] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [resetText, setResetText] = useState("");
  async function commit() {
    setError("");
    try {
      if (edit === "goal") {
        const item = goalSchema.parse({
          ...goal,
          ...stamp(),
          effectiveFrom: tomorrow,
        });
        if (currentTdee.rest + item.balance <= 0)
          throw new Error("목표 섭취량은 0kcal보다 커야 해요");
        await save({
          ...wallet,
          goal_history: [
            ...wallet.goal_history.filter((g) => g.effectiveFrom !== tomorrow),
            item,
          ],
        });
      }
      if (edit === "cycle") {
        const item = cycleSchema.parse({
          ...cycle,
          ...stamp(),
          effectiveFrom: tomorrow,
        });
        await save({
          ...wallet,
          cycle_history: [
            ...wallet.cycle_history.filter((c) => c.effectiveFrom !== tomorrow),
            item,
          ],
        });
      }
      if (edit === "weight") {
        const value = Number(weight);
        if (!weight || !Number.isFinite(value) || value < 25 || value > 350)
          throw new Error("체중을 25~350kg 사이로 입력해주세요");
        const existing = wallet.weights.find((w) => w.date === today);
        await save({
          ...wallet,
          weights: [
            ...wallet.weights.filter((w) => w.date !== today),
            {
              ...(existing ?? stamp()),
              date: today,
              weight: value,
              updatedAt: new Date().toISOString(),
            },
          ],
        });
      }
      if (edit === "reset") {
        if (resetText !== "초기화") throw new Error("초기화를 입력해주세요");
        await reset();
      }
      setEdit(null);
      setMessage(
        edit === "weight"
          ? "체중을 기록했어요. TDEE에 반영하려면 다시 계산해주세요."
          : edit === "reset"
            ? "초기화했어요"
            : `${tomorrow}부터 적용돼요`,
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function open(kind: NonNullable<typeof edit>) {
    setError("");
    setMessage("");
    if (kind === "goal")
      setGoal(effective(wallet.goal_history, tomorrow) ?? currentGoal);
    if (kind === "cycle")
      setCycle(effective(wallet.cycle_history, tomorrow) ?? currentCycle);
    setEdit(kind);
  }
  return (
    <>
      <div className="eyebrow">나의 관리 기준</div>
      <h1>마이</h1>
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
        <Metric label="주간 평균 TDEE" value={kcal(currentTdee.average)} />
        <Action secondary onClick={recalculate}>
          TDEE 다시 계산하기
        </Action>
        <p className="hint">
          기존 입력을 불러오며, 새 결과는 내일부터 적용돼요.
        </p>
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
          value={
            currentCycle.kind === "daily"
              ? "매일"
              : currentCycle.kind === "weekly"
                ? `매주 · ${["일", "월", "화", "수", "목", "금", "토"][currentCycle.weekday]}요일 시작`
                : `${currentCycle.days}일마다`
          }
        />
        <Action secondary onClick={() => open("cycle")}>
          관리 주기 변경
        </Action>
      </Card>
      <Card>
        <div className="section-heading">
          <h2>체중 기록</h2>
          <button
            className="text-action"
            onClick={() => {
              setWeight("");
              open("weight");
            }}
          >
            오늘 기록
          </button>
        </div>
        {wallet.weights.length ? (
          wallet.weights
            .slice()
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 7)
            .map((w) => (
              <Metric key={w.id} label={w.date} value={`${w.weight}kg`} />
            ))
        ) : (
          <p className="empty">아직 체중 기록이 없어요</p>
        )}
      </Card>
      <Card>
        <h2>설정 변경 이력</h2>
        <details>
          <summary>적용일과 계산 기준 보기</summary>
          {wallet.tdee_history
            .slice()
            .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
            .map((t) => (
              <Metric
                key={t.id}
                label={`${t.effectiveFrom} TDEE`}
                value={kcal(t.rest)}
              />
            ))}
          {wallet.goal_history.map((g) => (
            <Metric
              key={g.id}
              label={`${g.effectiveFrom} 목표`}
              value={balanceText(g.balance)}
            />
          ))}
          {wallet.cycle_history.map((c) => (
            <Metric
              key={c.id}
              label={`${c.effectiveFrom} 주기`}
              value={
                c.kind === "weekly"
                  ? "매주"
                  : c.kind === "daily"
                    ? "매일"
                    : `${c.days}일`
              }
            />
          ))}
        </details>
      </Card>
      <Card>
        <h2>데이터 관리</h2>
        <p>기록은 이 기기에 저장돼요. 앱을 삭제하기 전에 백업해주세요.</p>
        <div className="stack">
          <Action
            secondary
            disabled={busy}
            onClick={() => {
              setError("");
              void exportBackup(wallet)
                .then(() =>
                  setMessage(
                    "백업 파일 저장 요청을 완료했어요. 기기의 저장 위치를 확인해주세요.",
                  ),
                )
                .catch(() =>
                  setError(
                    "파일을 저장하지 못했어요. 지원되는 토스 앱 버전에서 다시 시도해주세요.",
                  ),
                );
            }}
          >
            JSON 파일 내보내기
          </Action>
          <Action secondary disabled={busy} onClick={importData}>
            데이터 가져오기
          </Action>
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
                : edit === "weight"
                  ? "오늘 체중 기록"
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
            <CycleFields cycle={cycle} onChange={setCycle} />
          )}
          {(edit === "goal" || edit === "cycle") && (
            <p className="notice">
              {tomorrow}부터 적용해요. 과거 통계의 기준은 보존해요.
            </p>
          )}
          {edit === "weight" && (
            <Field
              label="현재 체중 (kg)"
              type="number"
              step="0.1"
              min={25}
              max={350}
              value={weight}
              onChange={setWeight}
            />
          )}
          {edit === "reset" && (
            <>
              <p>
                신체 정보, 설정과 모든 기록을 이 기기에서 삭제해요. 복구하려면
                미리 내보낸 백업이 필요해요.
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
    </>
  );
}
