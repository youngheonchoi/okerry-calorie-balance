import { describe, expect, it, vi } from "vitest";
import { createFoodSync } from "../../src/data/foodSync";

const errorKey = "calorie_wallet_food_sync_errors";
const food = { foodName: "Apple", caloriesKcal: 95, quantity: 2 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
function setup() {
  const data = new Map<string, string>();
  const store = {
    getItem: vi.fn(async (key: string) => data.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      data.delete(key);
    }),
  };
  const fetcher = vi.fn<typeof fetch>();
  const createAuthCode = vi.fn().mockResolvedValue({ code: "one-use-code" });
  const sync = createFoodSync({
    baseUrl: "https://example.com",
    store,
    createAuthCode,
    fetcher,
  });
  return { data, store, fetcher, createAuthCode, sync };
}

describe("background food registration", () => {
  it("checks health, obtains a fresh code, and sends raw name and unit calories", async () => {
    const app = setup();
    app.fetcher
      .mockResolvedValueOnce(json({ status: "ok" }))
      .mockResolvedValueOnce(
        json({ status: "ok", clientErrorsRecorded: true }, 201),
      );
    await app.sync(food);
    expect(app.fetcher.mock.calls[0][0]).toBe("https://example.com/api/health");
    expect(app.createAuthCode).toHaveBeenCalledOnce();
    expect(JSON.parse(String(app.fetcher.mock.calls[1][1]?.body))).toEqual({
      ...food,
      code: "one-use-code",
      clientErrors: [],
    });
    expect(JSON.stringify([...app.data])).not.toContain("one-use-code");
  });
  it.each([503, 200])(
    "does not request identity or save when health is unavailable (%s)",
    async (status) => {
      const app = setup();
      app.fetcher.mockResolvedValue(json({ status: "unavailable" }, status));
      await expect(app.sync(food)).resolves.toBeUndefined();
      expect(app.createAuthCode).not.toHaveBeenCalled();
      expect(app.fetcher).toHaveBeenCalledOnce();
      expect(JSON.parse(app.data.get(errorKey)!)[0].errorCode).toBe(
        "HEALTH_UNAVAILABLE",
      );
    },
  );
  it("buffers network errors safely and forwards them on the next successful registration", async () => {
    const app = setup();
    app.fetcher.mockRejectedValueOnce(new Error("secret network data"));
    await app.sync(food);
    expect(app.data.get(errorKey)).not.toMatch(/secret|Apple/);
    app.fetcher
      .mockResolvedValueOnce(json({ status: "ok" }))
      .mockResolvedValueOnce(
        json({ status: "ok", clientErrorsRecorded: true }),
      );
    await app.sync({ ...food, foodName: "app le" });
    const request = JSON.parse(String(app.fetcher.mock.calls[2][1]?.body));
    expect(request.foodName).toBe("app le");
    expect(request.clientErrors).toHaveLength(1);
    expect(app.data.get(errorKey)).toBe("[]");
  });
  it("never sends food when the SDK cannot issue a code", async () => {
    const app = setup();
    app.fetcher.mockResolvedValue(json({ status: "ok" }));
    app.createAuthCode.mockRejectedValue(new Error("native failure"));
    await expect(app.sync(food)).resolves.toBeUndefined();
    expect(app.fetcher).toHaveBeenCalledOnce();
    expect(JSON.parse(app.data.get(errorKey)!)[0].stage).toBe("identity");
  });
  it("handles HTTP and network failures without rejecting to the caller", async () => {
    const app = setup();
    app.fetcher
      .mockResolvedValueOnce(json({ status: "ok" }))
      .mockResolvedValueOnce(json({ error: "DATABASE_UNAVAILABLE" }, 503));
    await expect(app.sync(food)).resolves.toBeUndefined();
    expect(JSON.parse(app.data.get(errorKey)!)[0].stage).toBe("food_save");
  });
  it("bounds the error buffer even if requests repeatedly fail", async () => {
    const app = setup();
    app.fetcher.mockRejectedValue(new Error("offline"));
    for (let index = 0; index < 25; index++) await app.sync(food);
    expect(JSON.parse(app.data.get(errorKey)!)).toHaveLength(20);
  });
  it("keeps food registration successful even when local error storage fails", async () => {
    const app = setup();
    app.store.getItem.mockRejectedValue(new Error("storage failure"));
    app.store.setItem.mockRejectedValue(new Error("storage failure"));
    app.fetcher
      .mockResolvedValueOnce(json({ status: "ok" }))
      .mockResolvedValueOnce(
        json({ status: "ok", clientErrorsRecorded: true }),
      );
    await expect(app.sync(food)).resolves.toBeUndefined();
    expect(app.fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops waiting for a hung SDK and records the failure", async () => {
    vi.useFakeTimers();
    try {
      const app = setup();
      app.fetcher.mockResolvedValue(json({ status: "ok" }));
      app.createAuthCode.mockImplementation(() => new Promise(() => {}));
      const task = app.sync(food);
      await vi.advanceTimersByTimeAsync(8100);
      await expect(task).resolves.toBeUndefined();
      expect(JSON.parse(app.data.get(errorKey)!)[0].stage).toBe("identity");
    } finally {
      vi.useRealTimers();
    }
  });
});
