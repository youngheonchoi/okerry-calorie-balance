import { balanceText, kcal, errorMessage } from "../domain/format";
import { useState } from "react";
import { Action, Card, Metric, Modal } from "../components/ui";
import {
  addDays,
  calculateCycleBalance,
  calculateTotalBalance,
  daily,
  datesBetween,
  effective,
  historicalCycle,
} from "../domain/calculations";
import {
  exerciseLabels,
  goalLabels,
  mealLabels,
  type MealType,
  type Wallet,
} from "../domain/model";
const menus = [
  { name: "두부 채소 덮밥", calories: 480, protein: 23 },
  { name: "닭가슴살 현미 비빔밥", calories: 560, protein: 35 },
  { name: "연어구이와 밥", calories: 650, protein: 32 },
  { name: "달걀 샌드위치와 요거트", calories: 430, protein: 22 },
  { name: "소고기 채소 볶음밥", calories: 720, protein: 30 },
  { name: "콩 샐러드와 통밀빵", calories: 510, protein: 20 },
];
export default function Home({
  wallet,
  openRecords,
  save,
  busy,
  today,
}: {
  wallet: Wallet;
  openRecords: (
    kind: "meal" | "exercise",
    date: string,
    type?: MealType,
  ) => void;
  save: (w: Wallet) => Promise<void>;
  busy: boolean;
  today: string;
}) {
  const [cycleDate, setCycleDate] = useState(today),
    [menuIndex, setMenuIndex] = useState(0),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  const stats = daily(wallet, today)!,
    goal = effective(wallet.goal_history, today)!,
    range = historicalCycle(wallet, cycleDate),
    cycle = range
      ? calculateCycleBalance(wallet, range.start, range.end, today)
      : null,
    total = calculateTotalBalance(wallet, today);
  const candidates = menus.filter(
      (m) => m.calories <= Math.max(stats.remaining, 0),
    ),
    menu = (candidates.length ? candidates : menus)[
      menuIndex % (candidates.length || menus.length)
    ];
  const exercise = wallet.exercises.filter((e) => e.date === today);
  return (
    <>
      <div className="section-heading">
        <span className="eyebrow">
          {new Date(today + "T12:00:00").toLocaleDateString("ko-KR", {
            month: "long",
            day: "numeric",
            weekday: "long",
          })}
        </span>
        <span className="badge">{goalLabels[goal.kind]}</span>
      </div>
      <h1>오늘의 칼로리 잔고</h1>
      <p className="subtitle">작은 기록이 모여, 나에게 맞는 균형으로</p>
      <Card className="balance-card">
        <span>
          {stats.remaining < 0 ? "목표 섭취량 초과" : "목표까지 남은 칼로리"}
        </span>
        <div className="hero-number">{kcal(Math.abs(stats.remaining))}</div>
        <div
          className="meter"
          role="meter"
          aria-label="목표 섭취 진행률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(
            100,
            Math.round((stats.intake / stats.target) * 100),
          )}
        >
          <span
            style={{
              width: `${Math.max(0, Math.min(100, (stats.intake / stats.target) * 100))}%`,
            }}
          />
        </div>
        <Metric label="오늘 목표 섭취량" value={kcal(stats.target)} />
        <Metric label="기록한 섭취량" value={kcal(stats.intake)} />
        <Metric label="오늘 예상 TDEE" value={kcal(stats.expenditure)} />
        <div className="balance-foot">
          <span>현재 기록 기준</span>
          <strong>{balanceText(stats.balance)}</strong>
        </div>
        <p>
          {stats.complete
            ? "하루 기록을 완료했어요"
            : "기록 중이에요. 미기록 식사는 0kcal로 확정하지 않아요."}
        </p>
      </Card>
      <div className="two">
        <Action onClick={() => openRecords("meal", today)}>식단 기록</Action>
        <Action secondary onClick={() => openRecords("exercise", today)}>
          운동 기록
        </Action>
      </div>
      <button
        className="completion"
        disabled={busy}
        onClick={() => setConfirm(true)}
      >
        {stats.complete
          ? "하루 기록 완료됨 · 다시 열기"
          : "오늘 식사·운동 기록 완료하기"}
      </button>
      <Card>
        <div className="section-heading">
          <h2>{cycleDate === today ? "이번 주기 잔고" : "이전 주기 잔고"}</h2>
          <span className="badge">완료일 기준</span>
        </div>
        {range && cycle ? (
          <>
            <p className="hint">
              {range.start} ~ {range.end}
            </p>
            <h3 className="cycle-number">
              {cycle.completed
                ? balanceText(cycle.balance)
                : "완료한 기록을 기다려요"}
            </h3>
            <Metric label="누적 섭취량" value={kcal(cycle.intake)} />
            <Metric label="누적 예상 소비량" value={kcal(cycle.expenditure)} />
            <Metric
              label="완료일의 목표 수지"
              value={balanceText(cycle.goalBalance)}
            />
            <Metric
              label="목표 대비 차이"
              value={kcal(cycle.balance - cycle.goalBalance)}
            />
            <p className="hint">
              완료 {cycle.completed}일 · 미완료 {cycle.pending}일 · 미래 날짜
              제외
            </p>
            <div className="chart" aria-label="일별 에너지 수지">
              {cycle.rows.map((r) => (
                <button
                  key={r.date}
                  onClick={() => openRecords("meal", r.date)}
                  title={`${r.date} ${r.complete ? balanceText(r.balance) : "미완료"}`}
                >
                  <span
                    className={`bar ${r.complete ? (r.balance <= 0 ? "deficit" : "surplus") : "pending"}`}
                    style={{
                      height: r.complete
                        ? `${Math.max(5, Math.min(60, Math.abs(r.balance) / 20))}px`
                        : "5px",
                    }}
                  />
                  <small>{r.date.slice(8)}</small>
                  <small>
                    {r.complete
                      ? r.balance < 0
                        ? "적자"
                        : r.balance > 0
                          ? "흑자"
                          : "균형"
                      : "미완료"}
                  </small>
                </button>
              ))}
            </div>
            <div className="two">
              <Action
                secondary
                disabled={range.start <= wallet.meta.startedOn}
                onClick={() => setCycleDate(addDays(range.start, -1))}
              >
                이전 주기
              </Action>
              <Action
                secondary
                disabled={range.end >= today}
                onClick={() => setCycleDate(addDays(range.end, 1))}
              >
                다음 주기
              </Action>
            </div>
          </>
        ) : (
          <p>이 날짜의 주기 설정이 없어요.</p>
        )}
      </Card>
      <Card>
        <h2>오늘의 식단</h2>
        {Object.entries(mealLabels).map(([type, label]) => {
          const items = wallet.meals.filter(
            (m) => m.date === today && m.type === type,
          );
          return (
            <button
              className="meal-row"
              key={type}
              onClick={() => openRecords("meal", today, type as MealType)}
            >
              <span>
                <strong>{label}</strong>
                <small>
                  {items.length
                    ? items.map((m) => m.name).join(", ")
                    : "아직 기록이 없어요"}
                </small>
              </span>
              <span>
                {items.length
                  ? kcal(items.reduce((n, m) => n + m.calories, 0))
                  : "추가"}
              </span>
            </button>
          );
        })}
      </Card>
      <Card>
        <div className="section-heading">
          <h2>오늘의 운동</h2>
          <button
            className="text-action"
            onClick={() => openRecords("exercise", today)}
          >
            추가
          </button>
        </div>
        {exercise.length ? (
          exercise.map((e) => (
            <Metric
              key={e.id}
              label={`${exerciseLabels[e.kind]} · ${e.minutes}분`}
              value={e.source === "daily" ? "일상량에 포함" : kcal(e.calories)}
            />
          ))
        ) : (
          <p className="empty">아직 기록이 없어요</p>
        )}
      </Card>
      <Card className="tinted">
        <div className="eyebrow">오늘 저녁, 이런 메뉴는 어때요?</div>
        <h2>{menu.name}</h2>
        <p>
          약 {kcal(menu.calories)} · 단백질 약 {menu.protein}g
        </p>
        <p className="hint">
          남은 목표 {kcal(stats.remaining)} · {goalLabels[goal.kind]} 기준
        </p>
        <p className="hint">
          {!candidates.length
            ? "남은 목표 안에 맞는 메뉴가 없어요. 끼니를 거르기보다 양과 구성을 조절해보세요."
            : "남은 목표 안에서 고른 메뉴예요."}{" "}
          재료와 양에 따라 달라지는 예시값이에요.
        </p>
        <Action secondary onClick={() => setMenuIndex((i) => i + 1)}>
          다른 메뉴 보기
        </Action>
      </Card>
      <Card>
        <h2>전체 누적 잔고</h2>
        <p className="hint">{wallet.meta.startedOn}부터 기록했어요</p>
        <h3>
          {total.completed
            ? balanceText(total.balance)
            : "아직 완료한 기록이 없어요"}
        </h3>
        <Metric label="기록 완료 일수" value={`${total.completed}일`} />
        <div className="week-dots">
          {datesBetween(addDays(today, -6), today).map((d) => (
            <div key={d}>
              <span
                className={
                  wallet.meta.completedDays.includes(d) ? "dot done" : "dot"
                }
              />
              <small>{d.slice(5)}</small>
              <small>
                {wallet.meta.completedDays.includes(d) ? "완료" : "미완료"}
              </small>
            </div>
          ))}
        </div>
        <p className="hint">
          미완료 날짜는 누적 적자·흑자에서 제외해요. 모든 소비량은 추정치예요.
        </p>
      </Card>
      {confirm && (
        <Modal
          title={
            stats.complete
              ? "오늘 기록을 다시 열까요?"
              : "오늘 기록을 완료할까요?"
          }
          onClose={() => setConfirm(false)}
        >
          <p>
            {stats.complete
              ? "완료 표시를 해제하고 누적 통계에서 제외해요."
              : "모든 식사와 운동을 기록했는지 확인해주세요. 미기록 식사는 섭취 없음으로 처리돼요."}
          </p>
          {stats.intake === 0 && !stats.complete && (
            <p className="warning">
              현재 식단 기록이 없어요. 완료하면 실제 섭취량 0kcal로 저장돼요.
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <Action
            disabled={busy}
            onClick={() => {
              void save({
                ...wallet,
                meta: {
                  ...wallet.meta,
                  updatedAt: new Date().toISOString(),
                  completedDays: stats.complete
                    ? wallet.meta.completedDays.filter((d) => d !== today)
                    : [...wallet.meta.completedDays, today],
                },
              })
                .then(() => setConfirm(false))
                .catch((e) => setError(errorMessage(e)));
            }}
          >
            확인
          </Action>
        </Modal>
      )}
    </>
  );
}
