import { Storage, File as TossFile } from "@apps-in-toss/web-framework";
import { createRepository } from "./repository";
import type { Wallet } from "../domain/model";
import { localDate } from "../domain/calculations";
export const repository = createRepository(Storage);
let draftQueue: Promise<unknown> = Promise.resolve();
function queueDraft<T>(operation: () => Promise<T>): Promise<T> {
  const next = draftQueue.then(operation, operation);
  draftQueue = next.catch(() => undefined);
  return next;
}
export const draftStore = {
  get: () => queueDraft(() => Storage.getItem("calorie_wallet_draft")),
  set: (value: string) =>
    queueDraft(() => Storage.setItem("calorie_wallet_draft", value)),
  clear: () => queueDraft(() => Storage.removeItem("calorie_wallet_draft")),
};
export async function exportBackup(wallet: Wallet) {
  if (!TossFile.saveBase64.isSupported())
    throw new Error("파일 저장을 지원하는 토스 앱 버전으로 업데이트해주세요.");
  const bytes = new TextEncoder().encode(JSON.stringify(wallet, null, 2));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  await TossFile.saveBase64({
    data: btoa(binary),
    fileName: `calorie-wallet-backup-${localDate()}.json`,
    mimeType: "application/json",
  });
}
