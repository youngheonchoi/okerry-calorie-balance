import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@apps-in-toss/web-framework", () => ({
  loadFullScreenAd: {},
  showFullScreenAd: {},
}));
import { createRewardedAdController } from "../../src/data/rewardedAds";
function setup() {
  type Input = {
    onEvent: (event: { type: string }) => void;
    onError: (error: unknown) => void;
  };
  let loadInput: Input, showInput: Input;
  const unload = vi.fn(),
    unshow = vi.fn();
  const load = Object.assign(
    vi.fn((input: Input) => {
      loadInput = input;
      return unload;
    }),
    { isSupported: () => true },
  );
  const show = Object.assign(
    vi.fn((input: Input) => {
      showInput = input;
      return unshow;
    }),
    { isSupported: () => true },
  );
  return {
    ad: createRewardedAdController({ load, show }),
    load,
    show,
    unload,
    unshow,
    loaded: () => loadInput.onEvent({ type: "loaded" }),
    event: (type: string) => showInput.onEvent({ type }),
  };
}
afterEach(() => vi.useRealTimers());
describe("rewarded ad lifecycle", () => {
  it("deduplicates preloads and rewards only earned, never dismissed", async () => {
    const app = setup();
    const first = app.ad.preload("test"),
      second = app.ad.preload("test");
    expect(first).toBe(second);
    expect(app.load).toHaveBeenCalledOnce();
    app.loaded();
    await first;
    const dismissed = app.ad.show();
    app.event("dismissed");
    await expect(dismissed).resolves.toBe(false);
    const next = app.ad.preload("test");
    app.loaded();
    await next;
    const earned = app.ad.show();
    app.event("userEarnedReward");
    app.event("dismissed");
    await expect(earned).resolves.toBe(true);
    expect(app.unshow).toHaveBeenCalledTimes(2);
    app.ad.dispose();
  });
  it("settles cancelled loading and showing and disallows reuse after disposal", async () => {
    const app = setup();
    const loading = app.ad.preload("test");
    const rejected = expect(loading).rejects.toThrow();
    app.ad.dispose();
    await rejected;
    await expect(app.ad.preload("test")).rejects.toThrow();
    const next = setup();
    const loaded = next.ad.preload("test");
    next.loaded();
    await loaded;
    const showing = next.ad.show();
    next.ad.dispose();
    await expect(showing).resolves.toBe(false);
  });
  it("ends a stalled preload and rejects showing without a loaded ad", async () => {
    vi.useFakeTimers();
    const app = setup();
    const promise = app.ad.preload("test");
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(65000);
    await assertion;
    await expect(app.ad.show()).rejects.toThrow();
    app.ad.dispose();
  });
});
