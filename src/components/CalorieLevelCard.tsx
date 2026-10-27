import { useState } from "react";
import { Asset, IconButton } from "@toss/tds-mobile";
import { adaptive } from "@toss/tds-colors";
import { Card, Metric, Modal } from "./ui";
import {
  calculateCalorieLevel,
  calculateRecordedBalance,
  getLevelBaselineBmr,
} from "../domain/calculations";
import {
  calorieLevelTiers,
  getCalorieLevelTier,
} from "../domain/calorieLevels";
import { kcal } from "../domain/format";
import type { Wallet } from "../domain/model";

export default function CalorieLevelCard({
  wallet,
  today,
}: {
  wallet: Wallet;
  today: string;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const balance = calculateRecordedBalance(wallet, today);
  const baselineBmr = getLevelBaselineBmr(wallet);
  const {
    level,
    caloriesPerLevel,
    estimatedKg,
    progressCalories,
    progressPercent,
    remainingCalories,
    days,
  } = calculateCalorieLevel(balance, baselineBmr, wallet.meta.startedOn, today);
  const tier = getCalorieLevelTier(level);
  const isMaxTier = tier.key === "ruby";
  const displayedKg = Math.round(estimatedKg * 10) / 10;

  return (
    <>
      <Card className={`calorie-level-card calorie-tier-${tier.key}`}>
        <div className="calorie-level-heading">
          <h2>나의 칼로리 레벨</h2>
          <IconButton
            name="icon-question-mono"
            aria-label="칼로리 레벨 안내"
            iconSize={18}
            color={adaptive.grey500}
            onClick={() => setHelpOpen(true)}
          />
        </div>
        <div className="calorie-level-overview">
          <div
            className="calorie-level-badge"
            aria-label={`${tier.label} 레벨 ${level} 트로피`}
          >
            <span className="calorie-level-trophy" aria-hidden="true">
              <Asset.Icon
                name="icon-trophy"
                frameShape={Asset.frameShape.CleanW40}
                aria-hidden="true"
              />
              {tier.key === "ruby" && (
                <span className="calorie-level-ruby-stone" />
              )}
            </span>
            <span>{tier.label}</span>
          </div>
          <div className="calorie-level-details">
            <span className="calorie-level-days">
              시작 D+{days.toLocaleString("ko-KR")}
            </span>
            <strong className="calorie-level-weight">
              Lv.{level.toLocaleString("ko-KR")}
            </strong>
            <span className="calorie-level-caption">
              환산 감량 {displayedKg > 0 ? "−" : ""}
              {displayedKg.toLocaleString("ko-KR", {
                maximumFractionDigits: 1,
              })}
              kg
            </span>
          </div>
        </div>
        <Metric
          label="누적 적자 칼로리"
          value={kcal(balance).replace(" ", "")}
        />
        {!isMaxTier && (
          <div className="calorie-level-progress-label">
            <span>다음 레벨 Lv.{(level + 1).toLocaleString("ko-KR")}</span>
            <strong>{Math.floor(progressPercent)}%</strong>
          </div>
        )}
        <div className={`calorie-level-gauge${isMaxTier ? " is-max" : ""}`}>
          <progress
            className="calorie-level-progress"
            aria-label={
              isMaxTier ? "최고 등급 루비 달성" : "다음 칼로리 레벨 진행률"
            }
            aria-valuetext={
              isMaxTier
                ? "MAX, 최고 등급 루비"
                : `${Math.floor(progressPercent)}%, 다음 레벨까지 ${kcal(Math.ceil(remainingCalories))}`
            }
            max={caloriesPerLevel}
            value={isMaxTier ? caloriesPerLevel : progressCalories}
          />
          {isMaxTier && (
            <span className="calorie-level-max-label" aria-hidden="true">
              MAX
            </span>
          )}
        </div>
        {!isMaxTier && (
          <p className="calorie-level-remaining">
            다음 레벨까지 {kcal(Math.ceil(remainingCalories))}
          </p>
        )}
      </Card>
      {helpOpen && (
        <Modal title="칼로리 레벨 안내" onClose={() => setHelpOpen(false)}>
          <div
            className="calorie-level-help"
            role="region"
            aria-label="칼로리 레벨 설명"
            tabIndex={0}
          >
            <p>
              레벨과 환산 감량은 나이·키·체중·성별을 바탕으로 정한 개인별 기준을
              사용해요. 사람마다 필요한 누적 적자 칼로리가 달라요.
            </p>
            <div className="calorie-level-help-baseline">
              <Metric label="나의 1레벨 기준" value={kcal(caloriesPerLevel)} />
            </div>
            <p>
              게이지는 다음 레벨까지의 진행률이에요. 100%에 도달하면 레벨이
              오르고, 다음 게이지가 0%에서 시작해요.
            </p>
            <p>
              최고 등급인 루비부터는 게이지에 MAX를 표시해요. 레벨과 환산 감량은
              계속 기록에 따라 갱신돼요.
            </p>
            <p>
              달력의 총 누적 잔고와 같은 값을 사용해요. 식단·활동·운동 기록이
              있는 날의 섭취량과 소비량 차이를 합산해요.
            </p>
            <p>
              칼로리 적자가 없으면 0레벨이에요. 기록을 수정하거나 잔고가 늘면
              레벨과 트로피도 다시 계산돼요.
            </p>
            <p>
              주기적으로 ‘내 정보’의 설정에서 기초대사량을 재계산해 주세요. 체중
              등 신체 정보가 바뀌었을 때 현재 소비량 추정에 반영할 수 있어요.
              레벨 기준은 시작 시 값으로 고정되며, 새 소비량 계산은 내일부터
              적용돼요.
            </p>
            <p>
              개인별 기준을 100% 채우면 레벨이 1 오르고 환산 감량은 1kg
              늘어나요. 환산 감량은 앱 내 진행 지표로, 실제 체중 감소량을 뜻하지
              않아요. 레벨은 감량 목표나 식사량 권장 기준이 아니에요.
            </p>
            <p>D+는 시작일부터 지난 일수이며, 시작한 날은 D+0이에요.</p>
            <section
              className="calorie-tier-guide"
              aria-label="등급별 레벨 범위"
            >
              <h3>등급별 레벨 범위</h3>
              <ul>
                {calorieLevelTiers.map((item) => (
                  <li key={item.key} className={`calorie-tier-${item.key}`}>
                    <span className="calorie-tier-dot" aria-hidden="true" />
                    <strong>{item.label}</strong>
                    <span>
                      Lv.{item.min}
                      {item.max === null ? " 이상" : `~${item.max}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </Modal>
      )}
    </>
  );
}
