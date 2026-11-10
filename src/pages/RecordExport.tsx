import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Checkbox } from "@toss/tds-mobile";
import { Action, Field } from "../components/ui";
import { addDays, localDate } from "../domain/calculations";
import type { Wallet } from "../domain/model";
import {
  createRecordReport,
  exportRangeError,
  recordReportCsv,
  recordReportPrompt,
  type ExportItem,
  type ExportRange,
  type ExportSelection,
} from "../domain/recordExport";
import { getExportAdGroupId } from "../data/exportAdConfig";
import {
  createRewardedAdController,
  type RewardedAdController,
} from "../data/rewardedAds";
import {
  canSaveRecordCsv,
  copyRecordPrompt,
  saveRecordCsv,
} from "../data/recordExport";

const options: { key: ExportItem; title: string; detail: string }[] = [
  {
    key: "profile",
    title: "내 정보",
    detail: "계산 기준, 나이, 키, 체중, 기초대사량",
  },
  { key: "activity", title: "활동", detail: "활동량, 걸음수, 칼로리 보정" },
  { key: "meals", title: "식단", detail: "끼니, 음식명, 수량, 섭취 칼로리" },
  { key: "exercises", title: "운동", detail: "운동 종류, 시간, 소모 칼로리" },
];

export default function RecordExport({
  wallet,
  today = localDate(),
}: {
  wallet: Wallet;
  today?: string;
}) {
  const earliest = wallet.meta.startedOn;
  const [range, setRange] = useState<ExportRange>({
    start: earliest > addDays(today, -6) ? earliest : addDays(today, -6),
    end: today,
  });
  const [selected, setSelected] = useState<ExportSelection>({
    profile: true,
    activity: true,
    meals: true,
    exercises: true,
  });
  const [format, setFormat] = useState<"csv" | "prompt">("csv");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const pending = useRef(false);
  const rangeError = exportRangeError(wallet, range, today);
  const report = useMemo(
    () =>
      rangeError ? null : createRecordReport(wallet, range, selected, today),
    [wallet, range, selected, today, rangeError],
  );
  const [promptOutput, setPromptOutput] = useState<{
    key: string;
    text: string;
  } | null>(null);
  const [csvGrantKey, setCsvGrantKey] = useState("");
  const [adPhase, setAdPhase] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  const [busyLabel, setBusyLabel] = useState("");
  const ad = useRef<RewardedAdController | null>(null);
  const alive = useRef(false);
  const configRequest = useRef<AbortController | null>(null);
  const fileSupported = canSaveRecordCsv();
  const requestKey = JSON.stringify([range.start, range.end, selected, format]);
  const prompt = promptOutput?.key === requestKey ? promptOutput.text : "";
  const unlocked = format === "prompt" ? !!prompt : csvGrantKey === requestKey;
  const preloadAd = useCallback(async () => {
    const current = ad.current;
    if (!current || !alive.current) return;
    configRequest.current?.abort();
    const request = new AbortController();
    configRequest.current = request;
    setAdPhase("loading");
    try {
      if (!current.supported()) throw new Error("Unsupported ads");
      const groupId = await getExportAdGroupId(request.signal);
      if (request.signal.aborted || ad.current !== current) return;
      if (!groupId) throw new Error("Export ad group not configured");
      await current.preload(groupId);
      if (alive.current && ad.current === current) setAdPhase("ready");
    } catch {
      if (alive.current && ad.current === current && !request.signal.aborted)
        setAdPhase("unavailable");
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const current = createRewardedAdController();
    ad.current = current;
    void preloadAd();
    return () => {
      alive.current = false;
      configRequest.current?.abort();
      current.dispose();
      if (ad.current === current) ad.current = null;
    };
  }, [preloadAd]);
  function clearNotice() {
    setError("");
    setMessage("");
  }
  function clearOutput() {
    clearNotice();
    setPromptOutput(null);
    setCsvGrantKey("");
  }
  function setPeriod(next: ExportRange) {
    clearOutput();
    setRange(next);
  }
  const monthStart = today.slice(0, 7) + "-01";
  const previousEnd = addDays(monthStart, -1);
  const clamp = (start: string) => (start < earliest ? earliest : start);
  async function handleExport() {
    if (!report || pending.current) return;
    if (!unlocked && adPhase !== "ready") {
      clearNotice();
      void preloadAd();
      return;
    }
    pending.current = true;
    setBusy(true);
    clearNotice();
    try {
      if (!unlocked) {
        setBusyLabel("광고 확인 중…");
        try {
          const earned = await ad.current!.show({ waitForDismissal: true });
          if (!alive.current) return;
          if (!earned) {
            setMessage("광고를 끝까지 보면 기록을 내보낼 수 있어요.");
            return;
          }
        } catch {
          if (alive.current)
            setError("광고를 재생하지 못했어요. 잠시 후 다시 시도해주세요.");
          return;
        } finally {
          if (alive.current) void preloadAd();
        }
        if (format === "prompt") {
          setPromptOutput({
            key: requestKey,
            text: recordReportPrompt(report),
          });
          setMessage("프롬프트를 만들었어요. 내용을 확인한 뒤 복사해주세요.");
          return;
        }
        // Keep this one export available if the native save fails or is cancelled.
        setCsvGrantKey(requestKey);
      }
      if (format === "csv") {
        setBusyLabel("파일 저장 중…");
        await saveRecordCsv(
          recordReportCsv(report),
          `calorie-wallet_${range.start}_${range.end}.csv`,
        );
        if (alive.current) {
          setCsvGrantKey("");
          setMessage("CSV 파일 저장 요청을 완료했어요.");
        }
      } else {
        setBusyLabel("복사 중…");
        await copyRecordPrompt(prompt);
        if (alive.current)
          setMessage("프롬프트를 복사했어요. AI 대화창에 붙여넣어 주세요.");
      }
    } catch (cause) {
      if (alive.current)
        setError(
          cause instanceof Error && cause.message.startsWith("복사 권한")
            ? cause.message
            : format === "csv"
              ? "파일을 저장하지 못했어요. 다시 시도해주세요."
              : "복사하지 못했어요. 아래 내용을 길게 눌러 직접 복사해주세요.",
        );
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        setBusyLabel("");
      }
    }
  }
  return (
    <section className="record-export-page">
      <h1>기록 내보내기</h1>
      <fieldset
        className="export-settings"
        disabled={busy}
        aria-label="내보내기 설정"
      >
        <section
          className="export-section"
          aria-labelledby="export-period-heading"
        >
          <h2 id="export-period-heading">기간 선택</h2>
          <div
            className="export-presets"
            role="group"
            aria-label="기간 빠른 선택"
          >
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPeriod({ start: clamp(addDays(today, -6)), end: today })
              }
            >
              최근 7일
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPeriod({ start: clamp(monthStart), end: today })
              }
            >
              이번 달
            </button>
            <button
              type="button"
              disabled={busy || previousEnd < earliest}
              onClick={() =>
                setPeriod({
                  start: clamp(previousEnd.slice(0, 7) + "-01"),
                  end: previousEnd,
                })
              }
            >
              지난달
            </button>
          </div>
          <div className="export-date-fields">
            <Field
              label="시작일"
              type="date"
              min={earliest}
              max={today}
              value={range.start}
              onChange={(start) => setPeriod({ ...range, start })}
            />
            <Field
              label="종료일"
              type="date"
              min={earliest}
              max={today}
              value={range.end}
              onChange={(end) => setPeriod({ ...range, end })}
            />
          </div>
          {rangeError && (
            <p className="error" role="alert">
              {rangeError}
            </p>
          )}
        </section>
        <section
          className="export-section"
          aria-labelledby="export-items-heading"
        >
          <h2 id="export-items-heading">내보낼 항목</h2>
          <div className="export-options">
            {options.map((option) => (
              <Checkbox.Circle
                key={option.key}
                checked={selected[option.key]}
                aria-label={option.title}
                disabled={busy}
                onCheckedChange={(checked) => {
                  clearOutput();
                  setSelected((current) => ({
                    ...current,
                    [option.key]: checked,
                  }));
                }}
                labelProps={{ className: "export-option" }}
              >
                <span className="export-option-text">
                  <strong>{option.title}</strong>
                  <span>{option.detail}</span>
                </span>
              </Checkbox.Circle>
            ))}
          </div>
        </section>
        <section
          className="export-section"
          aria-labelledby="export-format-heading"
        >
          <h2 id="export-format-heading">내보내기 형식</h2>
          <div className="export-formats">
            {(
              [
                {
                  value: "csv",
                  label: "CSV 파일",
                  description: "엑셀에서 열어볼 수 있어요.",
                },
                {
                  value: "prompt",
                  label: "AI용 프롬프트",
                  description: "복사해서 AI에게 물어볼 수 있어요.",
                },
              ] as const
            ).map((item) => (
              <label
                key={item.value}
                className={`export-format${format === item.value ? " selected" : ""}`}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={item.value}
                  checked={format === item.value}
                  disabled={busy}
                  onChange={() => {
                    clearOutput();
                    setFormat(item.value);
                  }}
                />
                <span>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </span>
              </label>
            ))}
          </div>
          {format === "csv" && !fileSupported && (
            <p role="status" className="export-help">
              파일 저장은 최신 토스 앱에서 이용할 수 있어요. AI용 프롬프트로
              내용을 확인할 수도 있어요.
            </p>
          )}
        </section>
      </fieldset>
      {format === "prompt" && prompt && (
        <section className="export-section">
          <label className="export-prompt-label" htmlFor="export-prompt">
            AI에게 물어볼 내용
          </label>
          <p className="export-help">
            선택한 항목만 포함해요. 내용을 확인한 뒤 복사해주세요.
          </p>
          <textarea
            id="export-prompt"
            className="export-prompt"
            value={prompt}
            readOnly
            spellCheck={false}
          />
        </section>
      )}
      <div className="export-actions">
        {!unlocked && (
          <p className="export-reward-help">
            광고를 끝까지 보면{" "}
            {format === "csv" ? "CSV 파일을 저장" : "AI용 프롬프트를 생성"}할 수
            있어요.
          </p>
        )}
        {!unlocked && adPhase === "loading" && (
          <p className="export-help" role="status">
            광고를 준비하고 있어요.
          </p>
        )}
        {!unlocked && adPhase === "unavailable" && (
          <p className="export-help" role="status">
            지금은 광고를 준비할 수 없어요. 잠시 후 다시 시도해주세요.
          </p>
        )}
        {message && (
          <p className="notice" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <Action
          disabled={
            busy ||
            !report ||
            (format === "csv" && !fileSupported) ||
            (!unlocked && adPhase === "loading")
          }
          onClick={() => void handleExport()}
        >
          {busy
            ? busyLabel
            : unlocked
              ? format === "csv"
                ? "CSV 파일 저장하기"
                : "프롬프트 복사하기"
              : adPhase === "loading"
                ? "광고 준비 중…"
                : adPhase === "unavailable"
                  ? "광고 다시 준비하기"
                  : format === "csv"
                    ? "광고 보고 CSV 저장하기"
                    : "광고 보고 프롬프트 만들기"}
        </Action>
      </div>
    </section>
  );
}
