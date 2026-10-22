import { useEffect, useRef, useState } from "react";
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
  exerciseLabels,
  stamp,
  type Cycle,
  type Goal,
  type Habit,
  type Profile,
  type Tdee,
} from "../domain/model";
import { estimateDailyTDEE, localDate } from "../domain/calculations";
import {
  bodySchema,
  cycleSchema,
  goalSchema,
  neatAnswersSchema,
  profileSchema,
  draftProfileSchema,
} from "../domain/validation";
import { draftStore } from "../data/sdk";
type Result = { profile: Profile; tdee: Tdee; goal: Goal; cycle: Cycle };
const newProfile = (): Profile => ({
  ...stamp(),
  basis: "male",
  age: NaN,
  height: NaN,
  weight: NaN,
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
    commuteDays: 0,
  },
  habits: [],
});
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
              balance: Number(v) * (goal.kind === "lose" ? -1 : 1),
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
            onChange={(v) => onChange({ ...cycle, days: Number(v) })}
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
  onComplete,
  onCancel,
  busy,
}: {
  initial?: Profile;
  initialCorrection?: number;
  onComplete: (r: Result) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [profile, setProfile] = useState<Profile>(initial ?? newProfile),
    [step, setStep] = useState(0),
    [correction, setCorrection] = useState(initialCorrection),
    [goal, setGoal] = useState(defaultGoal),
    [cycle, setCycle] = useState(defaultCycle),
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
          commuteDays: current.lifestyle.commuteDays ?? 0,
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
            [1, 2, 3].includes(d?.schemaVersion) &&
            d.profile &&
            typeof d.step === "number"
          ) {
            const check = draftProfileSchema.safeParse(d.profile);
            if (check.success) {
              setProfile(check.data);
              const previousStep =
                d.schemaVersion === 1 && d.step > 2 ? d.step - 1 : d.step;
              const restoredStep =
                d.schemaVersion < 3 && previousStep > 4
                  ? previousStep - 1
                  : previousStep;
              setStep(Math.min(6, Math.max(0, restoredStep)));
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
            schemaVersion: 3,
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
          setError(
            "뒤로가기를 연결하지 못했어요. 이전 단계 버튼을 이용해주세요.",
          ),
      }),
    [step, busy, onCancel],
  );
  const update = (key: keyof Profile, value: unknown) =>
    setProfile((p) => ({ ...p, [key]: value }));
  const life = (key: keyof Profile["lifestyle"], value: unknown) =>
    setProfile((p) => ({ ...p, lifestyle: { ...p.lifestyle, [key]: value } }));
  const valid = profileSchema.safeParse(profile).success;
  const result = valid ? estimateDailyTDEE(profile, correction) : null;
  const titles = [
    "내 몸의 하루 소비 칼로리를 알아볼까요?",
    "기본 신체 정보를 알려주세요",
    "운동하지 않는 날은 얼마나 움직이나요?",
    "일주일 동안 어떤 운동을 하시나요?",
    "나의 하루 소비 칼로리",
    "나에게 맞는 목표를 정해요",
    "한 주의 시작 요일을 정해요",
  ];
  async function next() {
    setError("");
    try {
      if (step === 1) bodySchema.parse(profile);
      if (step === 2) neatAnswersSchema.parse(profile.lifestyle);
      if (step >= 3) profileSchema.parse(profile);
      if (
        step === 4 &&
        (!result ||
          !Number.isFinite(correction) ||
          Math.abs(correction) > 2000 ||
          result.rest < 500)
      )
        throw new Error(
          "보정 후 소비량은 500kcal 이상, 보정값은 ±2,000kcal 이내로 입력해주세요",
        );
      if (step === 5) {
        goalSchema.parse(goal);
        if (result && result.rest + goal.balance <= 0)
          throw new Error("목표 섭취량은 0kcal보다 커야 해요");
      }
      if (step === 6 || (initial && step === 4)) {
        if (!initial) cycleSchema.parse(cycle);
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
            schemaVersion: 3,
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
  function habit(kind: Habit["kind"], patch: Partial<Habit>) {
    setProfile((p) => ({
      ...p,
      habits: p.habits.map((h) => (h.kind === kind ? { ...h, ...patch } : h)),
    }));
  }
  if (!ready) return <p role="status">임시 입력을 불러오고 있어요…</p>;
  return (
    <div className="onboarding">
      <header className="onboarding-header">
        <div className="eyebrow">
          {step > 0 ? `${step}/${initial ? 4 : 6}` : ""}
        </div>
        <progress max={initial ? 4 : 6} value={step} aria-label="설정 진행률" />
      </header>
      <div className="onboarding-content" ref={contentRef}>
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
            <p className="hint">계산에는 약 3~5분이 걸려요.</p>
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
                    {basis === "male" ? "남성" : "여성"}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field
              label="만 나이 (세)"
              name="age"
              type="number"
              value={profile.age}
              min={18}
              max={110}
              required
              onChange={(v) => update("age", v === "" ? NaN : Number(v))}
            />
            <div className="two">
              <Field
                label="키 (cm)"
                name="height"
                type="number"
                value={profile.height}
                min={100}
                max={250}
                required
                onChange={(v) => update("height", v === "" ? NaN : Number(v))}
              />
              <Field
                label="현재 체중 (kg)"
                name="weight"
                type="number"
                step="0.1"
                value={profile.weight}
                min={25}
                max={350}
                required
                onChange={(v) => update("weight", v === "" ? NaN : Number(v))}
              />
            </div>
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
        {step === 2 && (
          <>
            <p className="hint">
              운동하지 않는 평일 기준으로 답해주세요. 걸음 수에 출퇴근 도보가
              포함돼도 중복 계산하지 않아요.
            </p>
            <Select
              label="운동하지 않는 평일의 하루 평균 걸음 수는 얼마인가요?"
              name="stepBand"
              placeholder="선택해주세요"
              value={
                ["under3000", "3000to5000", "5000to8000", "8000plus"].includes(
                  profile.lifestyle.stepBand ?? "",
                )
                  ? profile.lifestyle.stepBand!
                  : ""
              }
              onChange={(v) => life("stepBand", v)}
              options={{
                under3000: "3,000보 미만",
                "3000to5000": "3,000~5,000보",
                "5000to8000": "5,000~8,000보",
                "8000plus": "8,000보 이상",
              }}
            />
            <Select
              label="근무일에 실제로 앉아 있는 시간은 어느 정도인가요?"
              name="sittingBand"
              placeholder="선택해주세요"
              value={
                ["under5", "5to6", "7to8", "9to10", "10plus"].includes(
                  profile.lifestyle.sittingBand ?? "",
                )
                  ? profile.lifestyle.sittingBand!
                  : ""
              }
              onChange={(v) => life("sittingBand", v)}
              options={{
                under5: "5시간 미만",
                "5to6": "5~6시간",
                "7to8": "7~8시간",
                "9to10": "9~10시간",
                "10plus": "10시간 이상",
              }}
            />
            <Field
              label="출퇴근 일수 (일/주)"
              name="commuteDays"
              type="number"
              min={0}
              max={7}
              step={1}
              value={profile.lifestyle.commuteDays ?? 0}
              onChange={(v) => life("commuteDays", Number(v))}
            />
            <Select
              label="출근 방식"
              name="commuteOutMode"
              placeholder="선택해주세요"
              value={profile.lifestyle.commuteOutMode ?? ""}
              onChange={(v) => life("commuteOutMode", v)}
              options={{ walk: "도보", bike: "자전거", other: "그 외" }}
            />
            {profile.lifestyle.commuteOutMode === "walk" && (
              <Field
                label="출근 도보 거리 (km)"
                name="commuteOutWalkKm"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={profile.lifestyle.commuteOutWalkKm ?? ""}
                onChange={(v) => life("commuteOutWalkKm", Number(v))}
              />
            )}
            {profile.lifestyle.commuteOutMode === "bike" && (
              <Field
                label="출근 자전거 시간 (분)"
                name="commuteOutBikeMinutes"
                type="number"
                min={0}
                max={300}
                value={profile.lifestyle.commuteOutBikeMinutes ?? ""}
                onChange={(v) => life("commuteOutBikeMinutes", Number(v))}
              />
            )}
            <Select
              label="퇴근 방식"
              name="commuteReturnMode"
              placeholder="선택해주세요"
              value={profile.lifestyle.commuteReturnMode ?? ""}
              onChange={(v) => life("commuteReturnMode", v)}
              options={{ walk: "도보", bike: "자전거", other: "그 외" }}
            />
            {profile.lifestyle.commuteReturnMode === "walk" && (
              <Field
                label="퇴근 도보 거리 (km)"
                name="commuteReturnWalkKm"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={profile.lifestyle.commuteReturnWalkKm ?? ""}
                onChange={(v) => life("commuteReturnWalkKm", Number(v))}
              />
            )}
            {profile.lifestyle.commuteReturnMode === "bike" && (
              <Field
                label="퇴근 자전거 시간 (분)"
                name="commuteReturnBikeMinutes"
                type="number"
                min={0}
                max={300}
                value={profile.lifestyle.commuteReturnBikeMinutes ?? ""}
                onChange={(v) => life("commuteReturnBikeMinutes", Number(v))}
              />
            )}
            <Select
              label="주말에 운동을 제외한 활동량은 어떤 편인가요?"
              name="weekendActivity"
              placeholder="선택해주세요"
              value={
                ["sedentary", "light", "active", "veryActive"].includes(
                  profile.lifestyle.weekendActivity ?? "",
                )
                  ? profile.lifestyle.weekendActivity!
                  : ""
              }
              onChange={(v) => life("weekendActivity", v)}
              options={{
                sedentary: "거의 집에서 앉거나 누워 있음",
                light: "가벼운 외출, 장보기 등으로 조금 움직임",
                active: "외출이 잦고 1~3시간 정도 걷거나 활동함",
                veryActive: "대부분의 시간을 밖에서 활발하게 움직임",
              }}
            />
          </>
        )}
        {step === 3 && (
          <>
            <p>평소 운동을 모두 선택해주세요.</p>
            <div className="choices">
              {Object.entries(exerciseLabels).map(([k, label]) => (
                <button
                  className={
                    profile.habits.some((h) => h.kind === k)
                      ? "choice selected"
                      : "choice"
                  }
                  key={k}
                  aria-pressed={profile.habits.some((h) => h.kind === k)}
                  onClick={() =>
                    setProfile((p) => ({
                      ...p,
                      habits: p.habits.some((h) => h.kind === k)
                        ? p.habits.filter((h) => h.kind !== k)
                        : [
                            ...p.habits,
                            {
                              kind: k as Habit["kind"],
                              sessions: 1,
                              minutes: 30,
                              intensity: "moderate",
                            },
                          ],
                    }))
                  }
                >
                  {label}
                </button>
              ))}
              <button
                className={
                  !profile.habits.length ? "choice selected" : "choice"
                }
                aria-pressed={!profile.habits.length}
                onClick={() => update("habits", [])}
              >
                운동하지 않음
              </button>
            </div>
            {profile.habits.map((h) => (
              <Card key={h.kind}>
                <h2>{exerciseLabels[h.kind]}</h2>
                <div className="two">
                  <Field
                    label="주간 횟수"
                    type="number"
                    value={h.sessions}
                    min={1}
                    max={21}
                    onChange={(v) => habit(h.kind, { sessions: Number(v) })}
                  />
                  <Field
                    label="평균 시간 (분)"
                    type="number"
                    value={h.minutes}
                    min={1}
                    max={600}
                    onChange={(v) => habit(h.kind, { minutes: Number(v) })}
                  />
                </div>
                <Select
                  label="운동 강도"
                  value={h.intensity}
                  onChange={(v) =>
                    habit(h.kind, { intensity: v as Habit["intensity"] })
                  }
                  options={{
                    light: "가볍게",
                    moderate: "보통",
                    hard: "격하게",
                  }}
                />
                {h.kind === "running" && (
                  <div className="two">
                    <Field
                      label="평균 거리 (km, 선택)"
                      type="number"
                      value={h.distance ?? ""}
                      onChange={(v) =>
                        habit(h.kind, {
                          distance: v === "" ? undefined : Number(v),
                        })
                      }
                    />
                    <Field
                      label="페이스 (분/km, 선택)"
                      type="number"
                      value={h.pace ?? ""}
                      onChange={(v) =>
                        habit(h.kind, {
                          pace: v === "" ? undefined : Number(v),
                        })
                      }
                    />
                  </div>
                )}
              </Card>
            ))}
          </>
        )}
        {step === 4 && result && (
          <>
            <Card className="tinted">
              <Metric label="예상 기초대사량" value={kcal(result.bmr)} />
              <Metric
                label="운동하지 않는 날 예상 소비량"
                value={kcal(result.rest)}
              />
              <Metric
                label="운동하는 날 예상 소비량"
                value={kcal(result.exerciseDay)}
              />
              <Metric
                label="주간 평균 하루 소비량"
                value={kcal(result.average)}
              />
            </Card>
            <p>계산 결과는 추정치로, 실제 소비량과 차이가 있을 수 있어요.</p>
          </>
        )}
        {step === 5 && (
          <>
            <GoalFields goal={goal} onChange={setGoal} automatic />
            {result && (
              <Card>
                <Metric
                  label="비운동일 목표 섭취량"
                  value={kcal(result.rest + goal.balance)}
                />
                {(result.rest + goal.balance < result.bmr ||
                  Math.abs(goal.balance) > 500) && (
                  <p className="warning">
                    목표 섭취량이 기초대사량보다 낮거나 조정 폭이 커요. 무리한
                    제한은 피하고 건강 상태에 맞게 목표를 조정해주세요.
                  </p>
                )}
              </Card>
            )}
          </>
        )}
        {step === 6 && (
          <>
            <CycleFields cycle={cycle} onChange={setCycle} weeklyOnly />
            {initial && (
              <p className="notice">
                새 결과는 내일부터 적용해요. 오늘과 과거 기록의 계산 기준은
                유지돼요.
              </p>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {initial && step === 4 && (
          <p className="notice">
            새 결과는 내일부터 적용해요. 오늘과 과거 기록의 계산 기준은
            유지돼요.
          </p>
        )}
      </div>
      <div className="footer-actions">
        <Action disabled={busy} onClick={() => void next()}>
          {busy
            ? "저장 중…"
            : step === 0
              ? "계산 시작하기"
              : step === 4
                ? initial
                  ? "계산 결과 저장하기"
                  : "이 결과로 시작하기"
                : step === 6
                  ? "설정 완료하기"
                  : "다음"}
        </Action>
        <Action
          secondary
          disabled={busy}
          onClick={() => (step === 0 ? onCancel() : goToStep(step - 1))}
        >
          {step === 0 ? "돌아가기" : "이전 단계"}
        </Action>
      </div>
    </div>
  );
}
