import { useEffect, useRef, useState } from "react";
import { Button } from "@toss/tds-mobile";
import { Action, Modal } from "./ui";
import {
  calorieApi,
  CalorieRequestError,
  type CalorieResult,
  type CreditStatus,
} from "../data/calorieApi";
import {
  createRewardedAdController,
  type RewardedAdController,
} from "../data/rewardedAds";

type Mode =
  | "checking"
  | "confirm"
  | "reward"
  | "calculating"
  | "ad-preparing"
  | "ad-playing"
  | "granting";
export default function CalorieCalculator({
  foodName,
  localResult,
  disabled,
  onResult,
}: {
  foodName: string;
  localResult?: { foodName: string; caloriesKcal: number };
  disabled: boolean;
  onResult: (result: CalorieResult) => void;
}) {
  const [credits, setCredits] = useState<CreditStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("checking");
  const [retryingCalculation, setRetryingCalculation] = useState(false);
  const [adReady, setAdReady] = useState(false);
  const [adUnavailable, setAdUnavailable] = useState(false);
  const controller = useRef<RewardedAdController | null>(null);
  const alive = useRef(false);
  const actionLock = useRef(false);
  const statusRequest = useRef<Promise<CreditStatus> | null>(null);

  function groupId(status: CreditStatus) {
    const override = import.meta.env.VITE_TOSS_REWARDED_AD_GROUP_ID?.trim();
    return import.meta.env.DEV
      ? "ait-ad-test-rewarded-id"
      : override || status.adGroupId || "";
  }
  function warmAd(status: CreditStatus) {
    if (!status.rewardAvailable || status.remainingCount > 0) return;
    const ad = controller.current;
    if (!ad) return;
    setAdReady(false);
    setAdUnavailable(false);
    void ad
      .preload(groupId(status))
      .then(() => {
        if (alive.current) setAdReady(true);
      })
      .catch(() => {
        if (alive.current) setAdUnavailable(true);
      });
  }
  async function status() {
    if (!statusRequest.current)
      statusRequest.current = calorieApi.status().finally(() => {
        statusRequest.current = null;
      });
    const next = await statusRequest.current;
    if (alive.current) {
      setCredits(next);
      warmAd(next);
    }
    return next;
  }
  useEffect(() => {
    alive.current = true;
    controller.current = createRewardedAdController();
    void status().catch(() => undefined);
    return () => {
      alive.current = false;
      controller.current?.dispose();
    };
    // Each food form gets its own controller; counts are refreshed on every open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = [
    "calculating",
    "ad-preparing",
    "ad-playing",
    "granting",
  ].includes(mode);
  function close() {
    if (!locked) setOpen(false);
  }
  async function showConfirmation() {
    if (disabled || actionLock.current) return;
    setOpen(true);
    setMode("checking");
    try {
      const current = await status();
      const pending = await calorieApi.hasPendingCalculation(foodName);
      if (alive.current) {
        setRetryingCalculation(pending);
        setMode(current.remainingCount > 0 || pending ? "confirm" : "reward");
      }
    } catch {
      if (alive.current) setOpen(false);
    }
  }
  async function calculate() {
    if (actionLock.current) return;
    actionLock.current = true;
    setMode("calculating");
    try {
      const reply = await calorieApi.calculate(foodName, localResult);
      if (!alive.current) return;
      setCredits(reply);
      setRetryingCalculation(false);
      onResult(reply.result);
      setOpen(false);
      warmAd(reply);
    } catch (error) {
      if (!alive.current) return;
      if (error instanceof CalorieRequestError && error.code === "NO_CREDITS") {
        try {
          await status();
          setMode("reward");
        } catch {
          setOpen(false);
        }
      } else setOpen(false);
    } finally {
      actionLock.current = false;
      if (alive.current)
        setMode((value) => (value === "calculating" ? "confirm" : value));
    }
  }
  async function watchAd() {
    if (
      actionLock.current ||
      !adReady ||
      !credits?.rewardAvailable ||
      credits.remainingCount !== 0
    )
      return;
    actionLock.current = true;
    setMode("ad-preparing");
    let eventId: string | undefined;
    let earned = false;
    try {
      const event = await calorieApi.prepareReward();
      eventId = event.eventId;
      if (!alive.current) {
        await calorieApi.cancelReward(eventId);
        return;
      }
      setMode("ad-playing");
      earned = await controller.current!.show();
      setAdReady(false);
      if (!earned) {
        await calorieApi.cancelReward(eventId);
        if (alive.current) {
          setMode("reward");
          warmAd(credits);
        }
        return;
      }
      if (alive.current) setMode("granting");
      const reply = await calorieApi.completeReward(eventId);
      if (alive.current) {
        setCredits(reply);
        setMode("confirm");
      }
    } catch {
      if (eventId && !earned)
        await calorieApi.cancelReward(eventId).catch(() => undefined);
      if (alive.current) {
        if (earned)
          setOpen(false); // Recover the pending earned reward on next open.
        else {
          setMode("reward");
          setAdReady(false);
          setAdUnavailable(true);
        }
      }
    } finally {
      actionLock.current = false;
    }
  }
  const title =
    mode === "confirm"
      ? "칼로리를 계산할까요?"
      : mode === "calculating"
        ? "칼로리를 확인하고 있어요"
        : "자동계산 이용하기";

  return (
    <>
      <div className="meal-calorie-auto-control">
        <Button
          className={`meal-calorie-auto-button${!disabled ? " wallet-action" : ""}`}
          type="button"
          size="small"
          variant={!disabled ? "fill" : "weak"}
          disabled={disabled || open}
          onClick={() => void showConfirmation()}
          aria-label={
            credits && credits.remainingCount > 0
              ? `자동계산, ${credits.remainingCount}회 남음`
              : "자동계산"
          }
        >
          자동계산
        </Button>
        {credits && credits.remainingCount > 0 && (
          <span className="meal-calorie-credit-badge" aria-hidden="true">
            {credits.remainingCount}
          </span>
        )}
      </div>
      {open && (
        <Modal title={title} onClose={close}>
          <div
            className="calorie-confirmation"
            aria-busy={mode === "checking" || locked}
          >
            <p className="calorie-confirmation-food">{foodName}</p>
            {mode === "checking" ? (
              <p role="status">남은 횟수를 확인하고 있어요.</p>
            ) : mode === "confirm" ? (
              <>
                <p className="calorie-confirmation-count">
                  남은 횟수 <strong>{credits?.remainingCount ?? 0}회</strong>
                </p>
                <p>
                  {retryingCalculation
                    ? "이전에 요청한 계산을 다시 확인해요. 같은 계산은 중복 차감되지 않아요."
                    : "계산 결과를 받으면 1회 사용돼요."}
                </p>
              </>
            ) : mode === "calculating" ? (
              <p role="status">칼로리를 확인하고 있어요.</p>
            ) : mode === "ad-playing" ? (
              <p role="status">광고 보상을 확인하고 있어요.</p>
            ) : mode === "granting" ? (
              <p role="status">5회를 충전하고 있어요.</p>
            ) : (
              <>
                <p>광고를 끝까지 보면 칼로리 자동계산 5회가 충전돼요.</p>
                {mode === "ad-preparing" ||
                (!adReady && !adUnavailable && credits?.rewardAvailable) ? (
                  <p role="status">광고를 준비하고 있어요.</p>
                ) : null}
                {adUnavailable || !credits?.rewardAvailable ? (
                  <p className="hint">
                    지금은 광고를 준비할 수 없어요. 잠시 후 다시 시도해주세요.
                  </p>
                ) : null}
              </>
            )}
            <div className="calorie-confirmation-actions">
              <Button
                type="button"
                size="medium"
                variant="weak"
                disabled={locked}
                onClick={close}
              >
                취소
              </Button>
              {mode === "confirm" ? (
                <Action
                  disabled={
                    !retryingCalculation &&
                    (!credits ||
                      credits.remainingCount - credits.reservedCount <= 0)
                  }
                  onClick={() => void calculate()}
                >
                  계산하기
                </Action>
              ) : mode === "reward" ? (
                <Action
                  disabled={
                    !adReady || !credits?.rewardAvailable || actionLock.current
                  }
                  onClick={() => void watchAd()}
                >
                  충전하기
                </Action>
              ) : (
                <Action disabled>
                  {mode === "calculating"
                    ? "계산 중"
                    : mode === "granting"
                      ? "충전 중"
                      : "준비 중"}
                </Action>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
