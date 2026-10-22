import type { Wallet } from "../domain/model";
import { validateWallet } from "../domain/validation";
export interface Store {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}
const fields = [
  "profile",
  "tdee_history",
  "goal_history",
  "cycle_history",
  "meals",
  "exercises",
  "weights",
  "meta",
] as const;
const key = (field: string) => `calorie_wallet_${field}`;
const journal = key("transaction");
export function createRepository(store: Store) {
  let queue: Promise<unknown> = Promise.resolve();
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  }
  async function restore(snapshot: Record<string, string | null>) {
    for (const field of fields) {
      const value = snapshot[field];
      if (value === null) await store.removeItem(key(field));
      else if (typeof value === "string")
        await store.setItem(key(field), value);
      else throw new Error("복구 스냅샷이 손상됐어요");
    }
  }
  async function recover() {
    const raw = await store.getItem(journal);
    if (raw !== null) {
      await restore(JSON.parse(raw));
      await store.removeItem(journal);
    }
  }
  async function snapshot() {
    return Object.fromEntries(
      await Promise.all(
        fields.map(async (f) => [f, await store.getItem(key(f))]),
      ),
    );
  }
  async function write(wallet: Wallet | null) {
    await recover();
    const before = await snapshot();
    await store.setItem(journal, JSON.stringify(before));
    try {
      for (const field of fields) {
        if (wallet === null) await store.removeItem(key(field));
        else
          await store.setItem(
            key(field),
            JSON.stringify({ schemaVersion: 1, data: wallet[field] }),
          );
      }
      await store.removeItem(journal);
    } catch (error) {
      try {
        await restore(before);
        await store.removeItem(journal);
      } catch {
        throw new Error(
          "저장과 복구가 중단됐어요. 앱을 다시 열면 기존 데이터 복구를 재시도해요.",
        );
      }
      throw error;
    }
  }
  return {
    load: () =>
      serial(async () => {
        await recover();
        const values = await snapshot();
        if (fields.every((f) => values[f] === null)) return null;
        const result: Record<string, unknown> = { schemaVersion: 1 };
        for (const f of fields) {
          if (values[f] === null)
            throw new Error(
              "저장된 데이터 일부가 없어요. 초기화하지 않고 백업 복원을 기다리고 있어요.",
            );
          const envelope = JSON.parse(values[f]!);
          if (envelope.schemaVersion !== 1)
            throw new Error("지원하지 않는 데이터 버전이에요");
          result[f] = envelope.data;
        }
        return validateWallet(result);
      }),
    save: (wallet: Wallet) => serial(() => write(validateWallet(wallet))),
    reset: () =>
      serial(async () => {
        await store.removeItem(key("draft"));
        await write(null);
      }),
  };
}
