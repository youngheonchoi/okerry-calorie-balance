import { useEffect, useId, useRef, useState } from "react";
import { Asset, IconButton } from "@toss/tds-mobile";
import { ZodError } from "zod";
import { Action, Card, Field, Metric, Select } from "../components/ui";
import { errorMessage, kcal } from "../domain/format";
import {
  defaultCycle,
  defaultGoal,
  suggestedGoalBalances,
} from "../domain/defaults";
import { graniteEvent } from "@apps-in-toss/web-framework";
import {
  goalLabels,
  stamp,
  type Cycle,
  type Goal,
  type Profile,
  type Tdee,
} from "../domain/model";
import { estimateDailyTDEE, localDate } from "../domain/calculations";
import {
  bodySchema,
  cycleSchema,
  goalSchema,
  profileSchema,
  draftProfileSchema,
} from "../domain/validation";
import { draftStore } from "../data/sdk";
type Result = { profile: Profile; tdee: Tdee; goal: Goal; cycle: Cycle };
const newProfile = (): Profile => ({
  ...stamp(),
  basis: "male",
  age: 30,
  height: 170,
  weight: 65,
  lifestyle: {
    occupation: 0,
    workHours: 0,
    sitting: 0,
    standing: 0,
    walking: 0,
    steps: 0,
    commute: "none",
    walkMinutes: 0,
    cycleMinutes: 0,
    other: "",
    otherMinutes: 0,
    commuteDays: undefined,
  },
  habits: [],
});
function BodyNumberField({
  label,
  name,
  value,
  defaultValue,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const adjust = (direction: number) => {
    const current = Number.isFinite(value) ? value : defaultValue;
    onChange(
      Number(
        Math.min(max, Math.max(min, current + direction * step)).toFixed(1),
      ),
    );
  };
  return (
    <div className="field body-number-field">
      <label htmlFor={id}>{label}</label>
      <div className="body-number-control">
        <IconButton
          type="button"
          name="icon-minus-mono"
          className="body-number-adjust"
          aria-label={`${label} 줄이기`}
          disabled={disabled || value <= min}
          onClick={() => adjust(-1)}
        />
        <input
          id={id}
          type="number"
          name={name}
          value={Number.isNaN(value) ? "" : value}
          min={min}
          max={max}
          step={step}
          required
          disabled={disabled}
          onChange={(event) =>
            onChange(
              event.target.value === "" ? NaN : Number(event.target.value),
            )
          }
        />
        <IconButton
          type="button"
          name="icon-plus-mono"
          className="body-number-adjust"
          aria-label={`${label} 늘리기`}
          disabled={disabled || value >= max}
          onClick={() => adjust(1)}
        />
      </div>
    </div>
  );
}
export function GoalFields({
  goal,
  onChange,
  automatic = false,
}: {
  goal: Goal;
  onChange: (goal: Goal) => void;
  automatic?: boolean;
}) {
  return (
    <>
      <Select
        label="어떤 목표로 칼로리를 관리하시나요?"
        value={goal.kind}
        onChange={(v) =>
          onChange({
            ...goal,
            kind: v as Goal["kind"],
            balance: automatic ? suggestedGoalBalances[v as Goal["kind"]] : 0,
          })
        }
        options={{
          lose: "체중 감량",
          maintain: "체중 유지",
          gain: "체중 증가",
        }}
      />
      {automatic && (
        <p className="notice">
          {goal.kind === "maintain"
            ? "하루 예상 소비량과 비슷하게 섭취하는 것을 목표로 해요."
            : `하루 ${Math.abs(goal.balance).toLocaleString()}kcal ${goal.kind === "lose" ? "적자" : "흑자"}를 목표로 해요. 예상 소비량보다 ${Math.abs(goal.balance).toLocaleString()}kcal ${goal.kind === "lose" ? "적게" : "더"} 섭취해요.`}
        </p>
      )}
      {!automatic && goal.kind !== "maintain" && (
        <Field
          label={`하루 목표 ${goal.kind === "lose" ? "적자" : "흑자"} (kcal)`}
          type="number"
          value={Math.abs(goal.balance)}
          onChange={(v) =>
            onChange({
              ...goal,
              balance:
                v === "" ? NaN : Number(v) * (goal.kind === "lose" ? -1 : 1),
            })
          }
          min={0}
          max={1500}
        />
      )}
      <p className="hint">
        작은 변화부터 시작해보세요. 목표는 언제든 바꿀 수 있어요.
      </p>
    </>
  );
}
export function CycleFields({
  cycle,
  onChange,
  weeklyOnly = false,
}: {
  cycle: Cycle;
  onChange: (cycle: Cycle) => void;
  weeklyOnly?: boolean;
}) {
  return (
    <>
      {weeklyOnly ? (
        <p>칼로리 잔고를 매주 단위로 관리해요.</p>
      ) : (
        <Select
          label="칼로리 잔고를 어떤 주기로 관리할까요?"
          value={cycle.kind}
          onChange={(v) => onChange({ ...cycle, kind: v as Cycle["kind"] })}
          options={{
            daily: "매일",
            weekly: "매주 (추천)",
            custom: "사용자 지정",
          }}
        />
      )}
      {(weeklyOnly || cycle.kind === "weekly") && (
        <Select
          label="시작 요일"
          value={String(cycle.weekday)}
          onChange={(v) => onChange({ ...cycle, weekday: Number(v) })}
          options={{
            1: "월요일",
            2: "화요일",
            3: "수요일",
            4: "목요일",
            5: "금요일",
            6: "토요일",
            0: "일요일",
          }}
        />
      )}
      {!weeklyOnly && cycle.kind === "custom" && (
        <>
          <Field
            label="주기 기준 시작일"
            type="date"
            value={cycle.anchor}
            onChange={(v) => onChange({ ...cycle, anchor: v })}
          />
          <Field
            label="주기 일수"
            type="number"
            min={1}
            max={365}
            value={cycle.days}
            onChange={(v) =>
              onChange({ ...cycle, days: v === "" ? NaN : Number(v) })
            }
          />
        </>
      )}
      <p className="hint">
        주기가 끝나도 기록은 남아요. 다음 주기는 자동으로 시작돼요.
      </p>
    </>
  );
}
export default function Onboarding({
  initial,
  initialCorrection = 0,
  initialGoal,
  initialCycle,
  onComplete,
  onCancel,
  busy,
}: {
  initial?: Profile;
  initialCorrection?: number;
  initialGoal?: Goal;
  initialCycle?: Cycle;
  onComplete: (r: Result) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(() =>
      initial
        ? { ...initial, weight: Math.round(initial.weight) }
        : newProfile(),
    ),
    [step, setStep] = useState(0),
    [correction, setCorrection] = useState(initialCorrection),
    [goal, setGoal] = useState(initialGoal ?? defaultGoal),
    [cycle, setCycle] = useState(initialCycle ?? defaultCycle),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const goToStep = (nextStep: number) => {
    setStep(nextStep);
    contentRef.current?.scrollTo({ top: 0 });
  };
  useEffect(() => {
    let active = true;
    if (initial) {
      setProfile((current) => ({
        ...current,
        lifestyle: {
          ...current.lifestyle,
          commuteDays: current.lifestyle.commuteDays,
        },
      }));
      setReady(true);
      return;
    }
    void draftStore
      .get()
      .then((raw) => {
        if (!active || !raw) return;
        try {
          const d = JSON.parse(raw);
          if (
            [1, 2, 3, 4].includes(d?.schemaVersion) &&
            d.profile &&
            typeof d.step === "number"
          ) {
            const check = draftProfileSchema.safeParse(d.profile);
            if (check.success) {
              setProfile({
                ...check.data,
                age: Number.isFinite(check.data.age) ? check.data.age : 30,
                height: Number.isFinite(check.data.height)
                  ? check.data.height
                  : 170,
                weight: Number.isFinite(check.data.weight)
                  ? Math.round(check.data.weight)
                  : 65,
                lifestyle: newProfile().lifestyle,
                habits: [],
              });
              const previousStep =
                d.schemaVersion === 1 && d.step > 2 ? d.step - 1 : d.step;
              const restoredStep =
                d.schemaVersion < 3 && previousStep > 4
                  ? previousStep - 1
                  : previousStep;
              const migratedStep =
                d.schemaVersion === 4
                  ? restoredStep
                  : restoredStep <= 0
                    ? 0
                    : restoredStep <= 3
                      ? 1
                      : restoredStep <= 5
                        ? 2
                        : 3;
              setStep(Math.min(4, Math.max(0, migratedStep)));
              setCorrection(Number(d.correction) || 0);
              const restoredGoal = goalSchema.safeParse(d.goal);
              if (restoredGoal.success)
                setGoal({
                  ...restoredGoal.data,
                  balance: suggestedGoalBalances[restoredGoal.data.kind],
                });
              const restoredCycle = cycleSchema.safeParse(d.cycle);
              if (restoredCycle.success)
                setCycle({ ...restoredCycle.data, kind: "weekly", days: 7 });
            }
          }
        } catch {
          setError("임시 입력을 불러오지 못했어요. 다시 입력해주세요.");
        }
      })
      .catch(() => {
        if (active) setError("임시 입력을 읽지 못했어요.");
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [initial]);
  useEffect(() => {
    if (!ready || initial) return;
    const timer = window.setTimeout(() => {
      void draftStore
        .set(
          JSON.stringify({
            schemaVersion: 4,
            profile,
            step,
            correction,
            goal,
            cycle,
          }),
        )
        .catch(() =>
          setError("임시 입력을 저장하지 못했어요. 다시 시도해주세요."),
        );
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, initial, profile, step, correction, goal, cycle]);
  useEffect(
    () =>
      graniteEvent.addEventListener("backEvent", {
        onEvent: () => {
          if (busy) return;
          if (step === 0) onCancel();
          else goToStep(step - 1);
        },
        onError: () =>
          setError("뒤로가기를 처리하지 못했어요. 잠시 후 다시 시도해주세요."),
      }),
    [step, busy, onCancel],
  );
  const update = (key: keyof Profile, value: unknown) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const valid = profileSchema.safeParse(profile).success;
  const result = valid ? estimateDailyTDEE(profile, correction) : null;
  const summaryStep = initial ? 2 : 4;
  const titles = initial
    ? [
        "내 몸의 하루 소비 칼로리를 알아볼까요?",
        "기본 정보를 알려주세요",
        "설정한 정보를 확인해주세요",
      ]
    : [
        "내 몸의 하루 소비 칼로리를 알아볼까요?",
        "기본 정보를 알려주세요",
        "나에게 맞는 목표를 정해요",
        "한 주의 시작 요일을 정해요",
        "설정한 정보를 확인해주세요",
      ];
  async function next() {
    setError("");
    try {
      if (step === 1) bodySchema.parse(profile);
      if (!initial && step === 2) goalSchema.parse(goal);
      if (!initial && step === 3) cycleSchema.parse(cycle);
      if (step === summaryStep) {
        profileSchema.parse(profile);
        if (!initial) {
          goalSchema.parse(goal);
          cycleSchema.parse(cycle);
        }
        const p = { ...profile, updatedAt: new Date().toISOString() };
        await onComplete({
          profile: p,
          tdee: {
            ...stamp(),
            effectiveFrom: localDate(),
            ...estimateDailyTDEE(p, correction),
          },
          goal,
          cycle,
        });
        return;
      }
      if (!initial)
        await draftStore.set(
          JSON.stringify({
            schemaVersion: 4,
            profile,
            step: step + 1,
            correction,
            goal,
            cycle,
          }),
        );
      setStep((s) => s + 1);
      contentRef.current?.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof ZodError) {
        setError("필수 항목을 입력하거나 입력값을 확인해주세요.");
        const firstField = e.issues.find((issue) => issue.path.length > 0)
          ?.path[0];
        const target =
          typeof firstField === "string"
            ? document.querySelector<HTMLElement>(
                `.onboarding [name="${firstField}"]`,
              )
            : null;
        const fallback = document.querySelector<HTMLElement>(
          ".onboarding input:invalid, .onboarding select:invalid",
        );
        const input = target ?? fallback;
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
        input?.focus({ preventScroll: true });
      } else {
        setError(errorMessage(e));
      }
    }
  }
  if (!ready) return <p role="status">임시 입력을 불러오고 있어요…</p>;
  return (
    <div className="onboarding">
      <div className="onboarding-content" ref={contentRef}>
        <div className="onboarding-progress">
          <div className="eyebrow">
            {step > 0 ? `${step}/${summaryStep}` : ""}
          </div>
          <progress max={summaryStep} value={step} aria-label="설정 진행률" />
        </div>
        <h1>{titles[step]}</h1>
        {step === 0 && (
          <>
            <p>기초대사량과 하루 총 에너지 소비량을 계산해 드려요.</p>
            <Card>
              <h2>기초대사량(BMR)</h2>
              <p>
                아무 활동을 하지 않아도 생명을 유지하기 위해 사용하는
                에너지예요.
              </p>
              <h2>하루 총 에너지 소비량(TDEE)</h2>
              <p>
                기초대사량에 일상 활동, 운동, 음식 소화에 사용하는 에너지까지
                포함한 하루 총 소비량이에요.
              </p>
            </Card>
            <p className="hint">계산에는 약 1~3분이 걸려요.</p>
          </>
        )}
        {step === 1 && (
          <>
            <fieldset className="field gender-field">
              <legend>성별</legend>
              <div
                className="gender-options"
                role="radiogroup"
                aria-label="성별"
              >
                {(["male", "female"] as const).map((basis) => (
                  <label
                    className={`gender-option${profile.basis === basis ? " selected" : ""}`}
                    key={basis}
                  >
                    <input
                      type="radio"
                      name="basis"
                      value={basis}
                      checked={profile.basis === basis}
                      onChange={() => update("basis", basis)}
                    />
                    <span className="gender-icon" aria-hidden="true">
                      <Asset.Icon
                        name={basis === "male" ? "icon-man" : "icon-woman"}
                        style={{ width: 24, height: 24 }}
                      />
                    </span>
                    {basis === "male" ? "남성" : "여성"}
                  </label>
                ))}
              </div>
            </fieldset>
            <BodyNumberField
              label="나이"
              name="age"
              value={profile.age}
              defaultValue={30}
              min={18}
              max={110}
              disabled={busy}
              onChange={(v) => update("age", v)}
            />
            <BodyNumberField
              label="키 (cm)"
              name="height"
              value={profile.height}
              defaultValue={170}
              min={100}
              max={250}
              disabled={busy}
              onChange={(v) => update("height", v)}
            />
            <BodyNumberField
              label="현재 체중 (kg)"
              name="weight"
              value={profile.weight}
              defaultValue={65}
              min={25}
              max={350}
              disabled={busy}
              onChange={(v) => update("weight", Math.round(v))}
            />
            {profile.basis === "manual" && (
              <Field
                label="BMR (kcal)"
                name="manualBmr"
                type="number"
                value={profile.manualBmr ?? ""}
                required
                onChange={(v) =>
                  update("manualBmr", v === "" ? undefined : Number(v))
                }
              />
            )}
          </>
        )}
        {!initial && step === 2 && (
          <GoalFields goal={goal} onChange={setGoal} automatic />
        )}
        {!initial && step === 3 && (
          <CycleFields cycle={cycle} onChange={setCycle} weeklyOnly />
        )}
        {step === summaryStep && result && (
          <>
            <Card className="tinted">
              <Metric label="예상 기초대사량" value={kcal(result.bmr)} />
            </Card>
            <Card>
              <h2>설정한 목표</h2>
              <Metric label="관리 목표" value={goalLabels[goal.kind]} />
              <Metric
                label="하루 목표 칼로리 적자"
                value={
                  goal.balance === 0
                    ? "균형 유지"
                    : (goal.balance > 0 ? "+" : "−") +
                      kcal(Math.abs(goal.balance))
                }
              />
            </Card>
            <Card>
              <h2>설정한 주기</h2>
              <Metric
                label="관리 주기"
                value={
                  cycle.kind === "daily"
                    ? "매일"
                    : cycle.kind === "weekly"
                      ? "매주"
                      : cycle.days + "일"
                }
              />
              {cycle.kind === "weekly" && (
                <Metric
                  label="시작 요일"
                  value={
                    [
                      "일요일",
                      "월요일",
                      "화요일",
                      "수요일",
                      "목요일",
                      "금요일",
                      "토요일",
                    ][cycle.weekday]
                  }
                />
              )}
              {cycle.kind === "custom" && (
                <Metric label="주기 기준 시작일" value={cycle.anchor} />
              )}
            </Card>
            <p>계산 결과는 추정치로, 실제 소비량과 차이가 있을 수 있어요.</p>
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {initial && step === summaryStep && (
          <p className="notice">
            새 결과는 내일부터 적용해요. 오늘과 과거 기록의 계산 기준은
            유지돼요.
          </p>
        )}
      </div>
      <div className="footer-actions intro-footer-actions">
        <Action disabled={busy} onClick={() => void next()}>
          {busy
            ? "저장 중…"
            : step === 0
              ? "계산 시작하기"
              : step === summaryStep
                ? initial
                  ? "저장하기"
                  : "설정 완료하기"
                : "다음"}
        </Action>
      </div>
    </div>
  );
}
