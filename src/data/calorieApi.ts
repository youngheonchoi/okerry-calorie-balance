import { Storage, User } from "@apps-in-toss/web-framework";
import { z } from "zod";

export type CalorieResult = {
  foodName: string;
  caloriesKcal: number;
  source: "storage" | "db" | "ai";
};
export type CreditStatus = {
  remainingCount: number;
  reservedCount: number;
  rewardAvailable: boolean;
  adGroupId: string | null;
};
type Reply = CreditStatus & {
  status: "ok";
  eventId?: string;
  result?: CalorieResult;
  clientErrorsRecorded?: boolean;
};
const baseUrl = (
  import.meta.env.VITE_CALORIE_API_URL?.trim() ||
  "https://okerry-calorie-balance-api.vercel.app"
).replace(/\/$/, "");
const pendingCalculationKey = "calorie_wallet_pending_calculation";
const pendingRewardKey = "calorie_wallet_pending_earned_reward";
const errorKey = "calorie_wallet_calculation_errors";
const errorSchema = z
  .object({
    requestId: z.uuid(),
    occurredAt: z.iso.datetime(),
    stage: z.literal("calorie_request"),
    errorCode: z.literal("CALORIE_REQUEST_FAILED"),
  })
  .strict();
const replySchema = z.object({
  status: z.literal("ok"),
  remainingCount: z.number().int().min(0).max(5),
  reservedCount: z.number().int().min(0).max(5),
  rewardAvailable: z.boolean(),
  adGroupId: z.string().nullable(),
  eventId: z.uuid().optional(),
  clientErrorsRecorded: z.boolean().optional(),
  result: z
    .object({
      foodName: z.string(),
      caloriesKcal: z.number().finite().min(0).max(10000),
      source: z.enum(["storage", "db", "ai"]),
    })
    .optional(),
});
export class CalorieRequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function read(key: string) {
  try {
    return await Storage.getItem(key);
  } catch {
    return null;
  }
}
async function write(key: string, value: string | null) {
  try {
    if (value === null) await Storage.removeItem(key);
    else await Storage.setItem(key, value);
  } catch {
    /* Storage failures cannot block the original food form. */
  }
}
async function errors() {
  try {
    return z
      .array(errorSchema)
      .max(20)
      .parse(JSON.parse((await read(errorKey)) || "[]"));
  } catch {
    return [];
  }
}
async function authCode() {
  return new Promise<{ code: string }>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CalorieRequestError("NETWORK_UNAVAILABLE")),
      8000,
    );
    Promise.resolve()
      .then(() => User.createAnonymousKeyAuthCode())
      .then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        () => {
          clearTimeout(timer);
          reject(new CalorieRequestError("NETWORK_UNAVAILABLE"));
        },
      );
  });
}
async function post(payload: Record<string, unknown>): Promise<Reply> {
  const requestId = crypto.randomUUID();
  try {
    const { code } = await authCode();
    const response = await fetch(`${baseUrl}/api/calories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ ...payload, code, clientErrors: await errors() }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new CalorieRequestError(
        typeof body.error === "string" ? body.error : "REQUEST_FAILED",
      );
    const result = replySchema.parse(body);
    if (result.clientErrorsRecorded) await write(errorKey, null);
    return result;
  } catch (error) {
    if (
      error instanceof CalorieRequestError &&
      error.code !== "NETWORK_UNAVAILABLE"
    )
      throw error;
    await write(
      errorKey,
      JSON.stringify(
        [
          ...(await errors()),
          {
            requestId,
            occurredAt: new Date().toISOString(),
            stage: "calorie_request",
            errorCode: "CALORIE_REQUEST_FAILED",
          },
        ].slice(-20),
      ),
    );
    throw new CalorieRequestError("NETWORK_UNAVAILABLE");
  }
}

export const calorieApi = {
  async hasPendingCalculation(foodName: string): Promise<boolean> {
    try {
      const previous = JSON.parse(
        (await read(pendingCalculationKey)) || "null",
      );
      return (
        previous?.foodName === foodName &&
        z.uuid().safeParse(previous.id).success
      );
    } catch {
      return false;
    }
  },
  async status(): Promise<CreditStatus> {
    const pending = await read(pendingRewardKey);
    if (pending && z.uuid().safeParse(pending).success) {
      try {
        const reply = await post({
          action: "reward_complete",
          eventId: pending,
        });
        await write(pendingRewardKey, null);
        return reply;
      } catch (error) {
        if (
          !(error instanceof CalorieRequestError) ||
          !["REQUEST_CONFLICT", "REWARD_EXPIRED"].includes(error.code)
        )
          throw error;
        await write(pendingRewardKey, null);
      }
    }
    return post({ action: "status" });
  },
  async prepareReward() {
    const reply = await post({ action: "reward_prepare" });
    if (!reply.eventId) throw new CalorieRequestError("REQUEST_FAILED");
    return { ...reply, eventId: reply.eventId };
  },
  async completeReward(eventId: string) {
    // Persist only after SDK userEarnedReward. Retry this SAME grant if the
    // network response is lost, rather than asking the user to watch again.
    await write(pendingRewardKey, eventId);
    const reply = await post({ action: "reward_complete", eventId });
    await write(pendingRewardKey, null);
    return reply;
  },
  async cancelReward(eventId: string) {
    return post({ action: "reward_cancel", eventId });
  },
  async calculate(
    foodName: string,
    localResult?: { foodName: string; caloriesKcal: number },
  ) {
    let calculationId = crypto.randomUUID();
    try {
      const previous = JSON.parse(
        (await read(pendingCalculationKey)) || "null",
      );
      if (
        previous?.foodName === foodName &&
        z.uuid().safeParse(previous.id).success
      )
        calculationId = previous.id;
    } catch {
      /* Ignore invalid local recovery metadata. */
    }
    await write(
      pendingCalculationKey,
      JSON.stringify({ id: calculationId, foodName }),
    );
    try {
      const reply = await post({
        action: "calculate",
        calculationId,
        foodName,
        ...(localResult ? { localResult } : {}),
      });
      if (!reply.result || reply.result.foodName !== foodName)
        throw new CalorieRequestError("NETWORK_UNAVAILABLE");
      await write(pendingCalculationKey, null);
      return { ...reply, result: reply.result };
    } catch (error) {
      if (
        error instanceof CalorieRequestError &&
        !["NETWORK_UNAVAILABLE", "REQUEST_PENDING"].includes(error.code)
      )
        await write(pendingCalculationKey, null);
      throw error;
    }
  },
};
