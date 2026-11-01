import { beforeEach, describe, expect, it, vi } from "vitest";
const { data, auth } = vi.hoisted(() => ({
  data: new Map<string, string>(),
  auth: vi.fn(async () => ({ code: "one-use-code" })),
}));
vi.mock("@apps-in-toss/web-framework", () => ({
  Storage: {
    getItem: async (key: string) => data.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: async (key: string) => {
      data.delete(key);
    },
  },
  User: { createAnonymousKeyAuthCode: auth },
}));
import { calorieApi } from "../../src/data/calorieApi";
const reply = (extra = {}) =>
  new Response(
    JSON.stringify({
      status: "ok",
      remainingCount: 4,
      reservedCount: 0,
      rewardAvailable: true,
      adGroupId: "test",
      clientErrorsRecorded: true,
      ...extra,
    }),
  );
const result = { foodName: "Apple", caloriesKcal: 95, source: "ai" };
beforeEach(() => {
  data.clear();
  vi.clearAllMocks();
});
describe("calculation recovery", () => {
  it("reuses a calculation ID after a lost response and clears it only on success", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network secret"))
      .mockResolvedValueOnce(reply({ result }));
    vi.stubGlobal("fetch", fetcher);
    await expect(calorieApi.calculate("Apple")).rejects.toMatchObject({
      code: "NETWORK_UNAVAILABLE",
    });
    await expect(calorieApi.calculate("Apple")).resolves.toMatchObject({
      remainingCount: 4,
      result,
    });
    const first = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    const second = JSON.parse(String(fetcher.mock.calls[1][1]?.body));
    expect(second.calculationId).toBe(first.calculationId);
    expect(second.clientErrors).toHaveLength(1);
    expect(data.has("calorie_wallet_pending_calculation")).toBe(false);
    expect(data.has("calorie_wallet_calculation_errors")).toBe(false);
    expect(auth).toHaveBeenCalledTimes(2);
    expect(JSON.stringify([...data])).not.toMatch(
      /one-use-code|network secret/,
    );
  });
  it("retries the same earned reward on the next status request after an interrupted grant", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(reply({ remainingCount: 5 }));
    vi.stubGlobal("fetch", fetcher);
    const id = crypto.randomUUID();
    await expect(calorieApi.completeReward(id)).rejects.toThrow();
    expect(data.get("calorie_wallet_pending_earned_reward")).toBe(id);
    await expect(calorieApi.status()).resolves.toMatchObject({
      remainingCount: 5,
    });
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({
      action: "reward_complete",
      eventId: id,
    });
    expect(data.has("calorie_wallet_pending_earned_reward")).toBe(false);
  });
  it("does not keep a definitively failed calculation for repeated retries", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response('{"error":"NO_RESULT"}', { status: 422 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await expect(calorieApi.calculate("???")).rejects.toMatchObject({
      code: "NO_RESULT",
    });
    expect(data.has("calorie_wallet_pending_calculation")).toBe(false);
  });
});
