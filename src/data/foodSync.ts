import type { Store } from "./repository";

export type SharedFood = {
  foodName: string;
  caloriesKcal: number;
  quantity: number;
};
type SyncError = {
  requestId: string;
  stage: "health_check" | "identity" | "food_save";
  errorCode: string;
  occurredAt: string;
};
const errorKey = "calorie_wallet_food_sync_errors";
const maxErrors = 20;

// Food history is saved independently. This queue never rejects to the UI.
export function createFoodSync({
  baseUrl,
  store,
  createAuthCode,
  fetcher = fetch,
}: {
  baseUrl: string;
  store: Store;
  createAuthCode: () => Promise<{ code: string }>;
  fetcher?: typeof fetch;
}) {
  let queue = Promise.resolve();
  let pendingErrors: SyncError[] | undefined;

  async function errors() {
    if (pendingErrors) return pendingErrors;
    try {
      const saved: unknown = JSON.parse(
        (await store.getItem(errorKey)) ?? "[]",
      );
      pendingErrors = Array.isArray(saved)
        ? saved
            .filter(
              (entry): entry is SyncError =>
                !!entry &&
                typeof entry.requestId === "string" &&
                ["health_check", "identity", "food_save"].includes(
                  entry.stage,
                ) &&
                typeof entry.errorCode === "string" &&
                typeof entry.occurredAt === "string",
            )
            .slice(-maxErrors)
        : [];
    } catch {
      pendingErrors = [];
    }
    return pendingErrors;
  }
  async function persistErrors(entries: SyncError[]) {
    pendingErrors = entries.slice(-maxErrors);
    try {
      await store.setItem(errorKey, JSON.stringify(pendingErrors));
    } catch {
      // Keep the bounded buffer in memory when Storage is unavailable.
    }
  }
  async function remember(requestId: string, stage: SyncError["stage"]) {
    await persistErrors([
      ...(await errors()),
      {
        requestId,
        stage,
        errorCode: {
          health_check: "HEALTH_UNAVAILABLE",
          identity: "AUTH_CODE_FAILED",
          food_save: "FOOD_REQUEST_FAILED",
        }[stage],
        occurredAt: new Date().toISOString(),
      },
    ]);
  }
  async function sync(food: SharedFood) {
    const requestId = crypto.randomUUID();
    let stage: SyncError["stage"] = "health_check";
    try {
      const health = await fetcher(`${baseUrl}/api/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
        headers: { "X-Request-Id": requestId },
      });
      if (!health.ok || (await health.json()).status !== "ok") {
        await remember(requestId, stage);
        return;
      }
      stage = "identity";
      // The auth code is used once and is never stored or logged.
      const { code } = await new Promise<{ code: string }>(
        (resolve, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Auth code timed out")),
            8000,
          );
          Promise.resolve()
            .then(createAuthCode)
            .then(
              (value) => {
                clearTimeout(timer);
                resolve(value);
              },
              (error: unknown) => {
                clearTimeout(timer);
                reject(error);
              },
            );
        },
      );
      if (!code) throw new Error("Missing auth code");
      stage = "food_save";
      const bufferedErrors = await errors();
      const response = await fetcher(`${baseUrl}/api/foods`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Request-Id": requestId,
        },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ ...food, code, clientErrors: bufferedErrors }),
      });
      if (!response.ok) {
        await remember(requestId, stage);
        return;
      }
      const result = await response.json();
      if (result.status !== "ok") throw new Error("Food registration failed");
      if (result.clientErrorsRecorded === true) await persistErrors([]);
    } catch {
      await remember(requestId, stage);
    }
  }

  return (food: SharedFood): Promise<void> => {
    queue = queue.then(() => sync(food)).catch(() => undefined);
    return queue;
  };
}
