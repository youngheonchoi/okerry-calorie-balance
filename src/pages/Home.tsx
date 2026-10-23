import { useEffect, useRef, useState } from "react";
import { balanceText, kcal } from "../domain/format";
import { Action, Card, Metric } from "../components/ui";
import { homeDetailsStore } from "../data/sdk";
import {
  addDays,
  calculateCycleBalance,
  calculateTotalBalance,
  daily,
  effective,
  getCycleDateRange,
} from "../domain/calculations";
import { goalLabels, type MealType, type Wallet } from "../domain/model";
export default function Home({
  wallet,
  openRecords,
  today,
}: {
  wallet: Wallet;
  openRecords: (
    kind: "meal" | "exercise",
    date: string,
    type?: MealType,
  ) => void;
  today: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsChanged = useRef(false);
  const stats = daily(wallet, today)!,
    goal = effective(wallet.goal_history, today)!,
    tdee = effective(wallet.tdee_history, today)!,
    cycle = effective(wallet.cycle_history, today)!,
    cycleRange = getCycleDateRange(today, cycle);
  const cycleBalance = calculateCycleBalance(
    wallet,
    cycleRange.start,
    cycleRange.end,
    today,
  ).balance;
  const totalBalance = calculateTotalBalance(wallet, today).balance;
  const startedOnLabel = new Date(
    `${wallet.meta.startedOn}T12:00:00`,
  ).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  const cycleDays = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(cycleRange.start, index);
    const dayStats = daily(wallet, date);
    const recorded =
      wallet.meals.some((item) => item.date === date) ||
      wallet.exercises.some((item) => item.date === date) ||
      wallet.meta.workoutStatus.some((item) => item.date === date);
    return { date, dayStats, recorded };
  });
  const workedOut = wallet.meta.workoutStatus.some(
    (item) => item.date === today && item.workedOut,
  );
  useEffect(() => {
    void homeDetailsStore
      .get()
      .then((value) => {
        if (!detailsChanged.current && value !== null) {
          setDetailsOpen(value === "true");
        }
      })
      .catch(() => undefined);
  }, []);
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
      <Card
        className={`balance-card${stats.remaining < 0 ? " over-budget" : ""}`}
      >
        <span>{stats.remaining < 0 ? "섭취량 초과" : "칼로리 잔고"}</span>
        <div className="hero-number">{kcal(Math.abs(stats.remaining))}</div>
        <div
          className={`meter${stats.remaining < 0 ? " over-budget" : ""}`}
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
        <button
          type="button"
          className="balance-toggle"
          aria-label={detailsOpen ? "칼로리 상세 정보 접기" : "칼로리 상세 정보 펼치기"}
          aria-controls="home-balance-details"
          aria-expanded={detailsOpen}
          onClick={() => {
            const next = !detailsOpen;
            detailsChanged.current = true;
            setDetailsOpen(next);
            void homeDetailsStore.set(next).catch(() => undefined);
          }}
        >
          <span>{detailsOpen ? "간략히 보기" : "자세히 보기"}</span>
          <span className={detailsOpen ? "balance-chevron expanded" : "balance-chevron"}>▾</span>
        </button>
        <div
          id="home-balance-details"
          className={`balance-details-shell${detailsOpen ? " open" : ""}`}
          aria-hidden={!detailsOpen}
        >
          <div className="balance-details">
            <div className="balance-context">
              <Metric
                label={workedOut ? "오늘 운동일 TDEE" : "오늘 비운동일 TDEE"}
                value={kcal(workedOut ? tdee.exerciseDay : tdee.rest)}
              />
            </div>
            <Metric label="오늘 가능 섭취량" value={kcal(stats.target)} />
            <Metric label="기록한 섭취량" value={kcal(stats.intake)} />
            <hr className="balance-divider" />
            <Metric
              label={
                goal.kind === "lose"
                  ? "목표 적자 칼로리"
                  : goal.kind === "gain"
                    ? "목표 흑자 칼로리"
                    : "목표 칼로리 수지"
              }
              value={balanceText(goal.balance)}
            />
            <div className="balance-foot">
              <span>현재 기록 기준</span>
              <strong>{balanceText(stats.balance)}</strong>
            </div>
            {stats.remaining < 0 && (
              <p className="over-budget-message">
                괜찮아요. 내일부터 다시 평소 루틴으로 돌아가는 게 중요해요.
              </p>
            )}
          </div>
        </div>
      </Card>
      <div className="two">
        <Action onClick={() => openRecords("meal", today)}>식단 기록</Action>
        <Action secondary onClick={() => openRecords("exercise", today)}>
          운동 기록
        </Action>
      </div>
      <section className="cycle-week" aria-label="이번 주기 칼로리 기록">
        <div className="section-heading cycle-week-heading">
          <h2>이번 주기</h2>
          <span>
            {cycleRange.start.slice(5).replace("-", ".")} ~ {cycleRange.end.slice(5).replace("-", ".")}
          </span>
        </div>
        <div className="cycle-week-strip">
          {cycleDays.map(({ date, dayStats, recorded }) => {
            const weekday = new Date(`${date}T12:00:00`).toLocaleDateString(
              "ko-KR",
              { weekday: "short" },
            );
            const balance = dayStats?.balance ?? 0;
            const balanceLabel = !recorded || !dayStats
              ? "미기록"
              : balance === 0
                ? "0 kcal"
                : `${balance > 0 ? "+" : "-"}${Math.round(Math.abs(balance)).toLocaleString("ko-KR")}kcal`;
            const balanceClass = !recorded || !dayStats
              ? "unrecorded"
              : balance < 0
                ? "deficit"
                : balance > 0
                  ? "surplus"
                  : "balanced";
            return (
              <div className={`cycle-day ${balanceClass}`} key={date}>
                <span className="cycle-day-weekday">{weekday}</span>
                <strong className="cycle-day-date">{Number(date.slice(8))}일</strong>
                <span className="cycle-day-balance">{balanceLabel}</span>
              </div>
            );
          })}
        </div>
        <div className="cycle-week-total">
          <span>이번 주 누적 칼로리 잔고</span>
          <strong>
            {cycleBalance === 0
              ? "0 kcal"
              : `${cycleBalance > 0 ? "+" : "-"}${Math.round(Math.abs(cycleBalance)).toLocaleString("ko-KR")} kcal`}
          </strong>
        </div>
      </section>
      <Card className="total-balance-card">
        <span className="total-balance-label">기록 시작일부터 전체 누적</span>
        <strong className="total-balance-value">
          {totalBalance === 0
            ? "0 kcal 균형"
            : `${totalBalance > 0 ? "+" : "-"}${kcal(Math.abs(totalBalance))} ${totalBalance > 0 ? "흑자" : "적자"}`}
        </strong>
        <span className="total-balance-period">
          {startedOnLabel}부터 오늘까지
        </span>
      </Card>
    </>
  );
}
