import { useState } from "react";
import { Action, Card, Modal } from "../components/ui";
import { parseBackup } from "../domain/validation";
import type { Wallet } from "../domain/model";
import { errorMessage } from "../domain/format";
export default function Backup({
  onRestore,
  onClose,
  exists,
  busy,
}: {
  onRestore: (w: Wallet) => Promise<void>;
  onClose: () => void;
  exists: boolean;
  busy: boolean;
}) {
  const [raw, setRaw] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<ReturnType<typeof parseBackup> | null>(
      null,
    );
  const inspect = (text: string) => {
    setError("");
    setPreview(null);
    try {
      setPreview(parseBackup(text));
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했어요");
    }
  };
  return (
    <Modal title="데이터 가져오기" onClose={onClose}>
      <p>
        내보낸 JSON 백업을 선택해주세요. 파일 선택이 열리지 않으면 내용을
        붙여넣을 수 있어요.
      </p>
      <label className="file-picker">
        JSON 파일 선택
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 20_000_000) {
              setError("20MB 이하 파일을 선택해주세요");
              return;
            }
            void file
              .text()
              .then(inspect)
              .catch(() =>
                setError("파일을 읽지 못했어요. JSON 붙여넣기를 이용해주세요."),
              );
            e.target.value = "";
          }}
        />
      </label>
      <details>
        <summary>JSON 내용 붙여넣기</summary>
        <label className="field">
          <span>백업 JSON</span>
          <textarea
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setPreview(null);
            }}
            rows={6}
          />
        </label>
        <Action secondary onClick={() => inspect(raw)}>
          내용 검증하기
        </Action>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <Card>
          <h3>복원할 데이터를 확인해주세요</h3>
          <p>기록 시작일 {preview.wallet.meta.startedOn}</p>
          <p>
            식단 {preview.wallet.meals.length}개 · 운동{" "}
            {preview.wallet.exercises.length}개 · 체중{" "}
            {preview.wallet.weights.length}개
          </p>
          <p>
            TDEE 이력 {preview.wallet.tdee_history.length}개 · 목표 이력{" "}
            {preview.wallet.goal_history.length}개 · 주기 이력{" "}
            {preview.wallet.cycle_history.length}개
          </p>
          {preview.missing.length > 0 && (
            <p className="warning">
              누락 항목: {preview.missing.join(", ")}. 누락된 기록은 빈 목록으로
              복원돼요. 나머지 설정과 기록은 복원할 수 있어요.
              {(preview.missing.includes("meals") ||
                preview.missing.includes("exercises")) &&
                " 식단·운동 누락으로 잘못된 수지가 확정되지 않도록 하루 기록 완료 표시를 해제해요."}
            </p>
          )}
          {exists && (
            <p className="warning">
              현재 데이터 전체를 이 백업으로 덮어써요. 필요하면 먼저
              내보내주세요.
            </p>
          )}
          <Action
            disabled={busy}
            onClick={() => {
              void onRestore(preview.wallet).catch((e) =>
                setError(errorMessage(e)),
              );
            }}
          >
            확인하고 복원하기
          </Action>
        </Card>
      )}
    </Modal>
  );
}
