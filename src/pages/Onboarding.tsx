import { useEffect, useState } from "react";
import { Action, Card, Field, Metric, Select } from "../components/ui";
import { errorMessage, kcal } from "../domain/format";
import { defaultCycle, defaultGoal } from "../domain/defaults";
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
  lifestyleSchema,
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
  },
  habits: [],
});
export function GoalFields({
  goal,
  onChange,
}: {
  goal: Goal;
  onChange: (goal: Goal) => void;
}) {
  return (
    <>
      <Select
        label="어떤 목표로 칼로리를 관리하시나요?"
        value={goal.kind}
        onChange={(v) =>
          onChange({ ...goal, kind: v as Goal["kind"], balance: 0 })
        }
        options={{
          lose: "체중 감량",
          maintain: "체중 유지",
          gain: "체중 증가",
        }}
      />
      {goal.kind !== "maintain" && (
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
}: {
  cycle: Cycle;
  onChange: (cycle: Cycle) => void;
}) {
  return (
    <>
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
      {cycle.kind === "weekly" && (
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
      {cycle.kind === "custom" && (
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
  useEffect(() => {
    let active = true;
    if (initial) {
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
            d?.schemaVersion === 1 &&
            d.profile &&
            typeof d.step === "number"
          ) {
            const check = draftProfileSchema.safeParse(d.profile);
            if (check.success) {
              setProfile(check.data);
              setStep(Math.min(8, Math.max(0, d.step)));
              setCorrection(Number(d.correction) || 0);
              if (goalSchema.safeParse(d.goal).success) setGoal(d.goal);
              if (cycleSchema.safeParse(d.cycle).success) setCycle(d.cycle);
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
            schemaVersion: 1,
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
          else setStep((s) => s - 1);
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
    "평소 하루를 어떻게 보내시나요?",
    "평소 얼마나 움직이시나요?",
    "일주일 동안 어떤 운동을 하시나요?",
    "입력한 활동량을 확인해주세요",
    "나의 하루 소비 칼로리",
    "나에게 맞는 목표를 정해요",
    "기록을 모아볼 주기를 정해요",
  ];
  async function next() {
    setError("");
    try {
      if (step === 1) bodySchema.parse(profile);
      if (step === 2 || step === 3) lifestyleSchema.parse(profile.lifestyle);
      if (step >= 4) profileSchema.parse(profile);
      if (
        step === 6 &&
        (!result ||
          !Number.isFinite(correction) ||
          Math.abs(correction) > 2000 ||
          result.rest < 500)
      )
        throw new Error(
          "보정 후 소비량은 500kcal 이상, 보정값은 ±2,000kcal 이내로 입력해주세요",
        );
      if (step === 7) {
        goalSchema.parse(goal);
        if (result && result.rest + goal.balance <= 0)
          throw new Error("목표 섭취량은 0kcal보다 커야 해요");
      }
      if (step === 8 || (initial && step === 6)) {
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
            schemaVersion: 1,
            profile,
            step: step + 1,
            correction,
            goal,
            cycle,
          }),
        );
      setStep((s) => s + 1);
      window.scrollTo(0, 0);
    } catch (e) {
      setError(errorMessage(e));
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
      <div className="eyebrow">
        {initial ? "TDEE 다시 계산하기" : "시작하기"} · {step}/
        {initial ? 6 : 8}
      </div>
      <progress max={initial ? 6 : 8} value={step} aria-label="설정 진행률" />
      <h1>{titles[step]}</h1>
      {step === 0 && (
        <>
          <p>
            기초대사량과 하루 총 에너지 소비량을 계산해 드려요.
          </p>
          <Card>
            <h2>기초대사량(BMR)</h2>
            <p>
              아무 활동을 하지 않아도 생명을 유지하기 위해 사용하는 에너지예요.
            </p>
            <h2>하루 총 에너지 소비량(TDEE)</h2>
            <p>
              기초대사량에 일상 활동, 운동, 음식 소화에 사용하는 에너지까지
              포함한 하루 총 소비량이에요.
            </p>
          </Card>
          <p className="hint">
            계산에는 약 3~5분이 걸려요.
          </p>
        </>
      )}
      {step === 1 && (
        <>
          <Select
            label="계산식 적용 기준"
            value={profile.basis}
            onChange={(v) => update("basis", v)}
            options={{
              male: "남성 기준",
              female: "여성 기준",
              manual: "BMR 직접 입력",
            }}
          />
          <Field
            label="만 나이 (세)"
            type="number"
            value={profile.age}
            min={18}
            max={110}
            onChange={(v) => update("age", v === "" ? NaN : Number(v))}
          />
          <div className="two">
            <Field
              label="키 (cm)"
              type="number"
              value={profile.height}
              min={100}
              max={250}
              onChange={(v) => update("height", v === "" ? NaN : Number(v))}
            />
            <Field
              label="현재 체중 (kg)"
              type="number"
              step="0.1"
              value={profile.weight}
              min={25}
              max={350}
              onChange={(v) => update("weight", v === "" ? NaN : Number(v))}
            />
          </div>
          {profile.basis === "manual" && (
            <Field
              label="BMR (kcal)"
              type="number"
              value={profile.manualBmr ?? ""}
              onChange={(v) =>
                update("manualBmr", v === "" ? undefined : Number(v))
              }
            />
          )}
          <p className="hint">
            Mifflin-St Jeor 공식으로 추정해요. 입력한 정보는 기기에만 저장돼요.
          </p>
        </>
      )}
      {step === 2 && (
        <>
          <Select
            label="평소 생활"
            value={String(profile.lifestyle.occupation)}
            onChange={(v) => life("occupation", Number(v))}
            options={{
              0: "대부분 앉아서 생활해요",
              1: "앉아 있는 시간이 많지만 가끔 움직여요",
              2: "서 있거나 걷는 시간이 많아요",
              3: "육체적인 활동이 많은 일을 해요",
            }}
          />
          <p className="hint">
            하루 전체 시간을 입력해주세요. 근무시간은 아래 시간에 포함되는 참고
            정보이며 다시 더하지 않아요.
          </p>
          {(
            [
              ["workHours", "평균 근무시간"],
              ["sitting", "앉아 있는 시간"],
              ["standing", "서 있는 시간"],
              ["walking", "걷는 시간"],
            ] as const
          ).map(([k, label]) => (
            <Field
              key={k}
              label={`${label} (시간/일)`}
              type="number"
              step="0.5"
              min={0}
              max={24}
              value={profile.lifestyle[k]}
              onChange={(v) => life(k, Number(v))}
            />
          ))}
        </>
      )}
      {step === 3 && (
        <>
          <p className="hint">
            정기 운동은 빼고 입력해주세요. 걸음 수·걷는 시간·도보 이동은 같은
            활동으로 보고 가장 큰 값 하나만 반영해요.
          </p>
          <Field
            label="하루 평균 일상 걸음 수 (보)"
            type="number"
            value={profile.lifestyle.steps}
            onChange={(v) => life("steps", Number(v))}
          />
          <Select
            label="출퇴근 이동 방식"
            value={profile.lifestyle.commute}
            onChange={(v) => life("commute", v)}
            options={{
              none: "해당 없음",
              transit: "대중교통",
              car: "자동차",
              walk: "도보",
              bike: "자전거",
            }}
          />
          {(
            [
              ["walkMinutes", "도보 이동 시간"],
              ["cycleMinutes", "자전거 이동 시간"],
              ["otherMinutes", "기타 반복 활동 시간"],
            ] as const
          ).map(([k, label]) => (
            <Field
              key={k}
              label={`${label} (분/일)`}
              type="number"
              value={profile.lifestyle[k]}
              onChange={(v) => life(k, Number(v))}
            />
          ))}
          <Field
            label="기타 반복 활동 (선택)"
            value={profile.lifestyle.other}
            onChange={(v) => life("other", v)}
          />
        </>
      )}
      {step === 4 && (
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
              className={!profile.habits.length ? "choice selected" : "choice"}
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
                options={{ light: "가볍게", moderate: "보통", hard: "격하게" }}
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
                      habit(h.kind, { pace: v === "" ? undefined : Number(v) })
                    }
                  />
                </div>
              )}
            </Card>
          ))}
        </>
      )}
      {step === 5 && (
        <Card>
          <Metric
            label="앉기 / 서기 / 걷기"
            value={`${profile.lifestyle.sitting} / ${profile.lifestyle.standing} / ${profile.lifestyle.walking} 시간`}
          />
          <Metric
            label="일상 걸음 수"
            value={`${profile.lifestyle.steps.toLocaleString()}보`}
          />
          <Metric
            label="일상 자전거"
            value={`${profile.lifestyle.cycleMinutes}분`}
          />
          {profile.habits.map((h) => (
            <Metric
              key={h.kind}
              label={exerciseLabels[h.kind]}
              value={`주 ${h.sessions}회 · ${h.minutes}분`}
            />
          ))}
          <Metric
            label="주간 예상 추가 운동 소비"
            value={kcal(result?.weeklyExercise ?? 0)}
          />
          <div className="actions">
            <Action secondary onClick={() => setStep(2)}>
              생활 수정
            </Action>
            <Action secondary onClick={() => setStep(4)}>
              운동 수정
            </Action>
          </div>
        </Card>
      )}
      {step === 6 && result && (
        <>
          <Card className="tinted">
            <Metric label="예상 BMR" value={kcal(result.bmr)} />
            <Metric label="비운동일 예상 TDEE" value={kcal(result.rest)} />
            <Metric label="운동일 예상 TDEE" value={kcal(result.exerciseDay)} />
            <Metric label="주간 평균 TDEE" value={kcal(result.average)} />
          </Card>
          <details>
            <summary>계산 근거와 추정 오차</summary>
            <p>
              BMR {kcal(result.bmr)} + 비운동 활동 {kcal(result.nonExercise)} +
              음식 소화(TEF) {kcal(result.tef)} + 직접 보정 {kcal(correction)}
              으로 계산했어요. TEF는 유지 섭취량의 약 10% 가정이며 실제
              식사량·구성에 따라 달라져요.
            </p>
            <p>
              걸음 수는 분당 100보, 일상 활동은 단순 MET 모델로 추정해요. 활동
              분류와 이동 방식은 참고 정보이며 별도 배수를 곱하지 않아요.
              운동일은 주간 운동량을 최대 7일에 나눈 예상치예요. 일별 잔고에는
              실제 기록한 운동만 추가해요.
            </p>
            <p>
              입력 오차와 개인 차이가 있어요. 거리·페이스는 참고 기록이며 시간과
              강도로 계산해요.
            </p>
          </details>
          <Field
            label="하루 소비량 직접 보정 (kcal, ±2,000)"
            type="number"
            min={-2000}
            max={2000}
            value={correction}
            onChange={(v) => setCorrection(Number(v))}
          />
          <p>
            계산 결과는 추정치예요. 실제 체중 변화에 따라 조정하면 더 정확하게
            관리할 수 있어요.
          </p>
        </>
      )}
      {step === 7 && (
        <>
          <GoalFields goal={goal} onChange={setGoal} />
          {result && (
            <Card>
              <Metric
                label="비운동일 목표 섭취량"
                value={kcal(result.rest + goal.balance)}
              />
              {(result.rest + goal.balance < result.bmr ||
                Math.abs(goal.balance) > 500) && (
                <p className="warning">
                  목표 섭취량이 BMR보다 낮거나 조정 폭이 커요. 무리한 제한은
                  피하고 건강 상태에 맞게 목표를 조정해주세요.
                </p>
              )}
            </Card>
          )}
        </>
      )}
      {step === 8 && (
        <>
          <CycleFields cycle={cycle} onChange={setCycle} />
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
      {initial && step === 6 && (
        <p className="notice">
          새 결과는 내일부터 적용해요. 오늘과 과거 기록의 계산 기준은 유지돼요.
        </p>
      )}
      <div className="footer-actions">
        <Action disabled={busy} onClick={() => void next()}>
          {busy
            ? "저장 중…"
            : step === 0
              ? "계산 시작하기"
              : step === 6
                ? initial
                  ? "계산 결과 저장하기"
                  : "이 결과로 시작하기"
                : step === 8
                  ? "설정 완료하기"
                  : "다음"}
        </Action>
        <Action
          secondary
          disabled={busy}
          onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
        >
          {step === 0 ? "돌아가기" : "이전 단계"}
        </Action>
      </div>
    </div>
  );
}
