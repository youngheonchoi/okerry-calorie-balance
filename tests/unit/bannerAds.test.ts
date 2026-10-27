import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  version: "5.247.0",
  supported: true,
  initialize: vi.fn(),
}));
vi.mock("@apps-in-toss/web-framework", () => ({
  Environment: {
    get tossAppVersion() {
      return sdk.version;
    },
  },
  TossAds: {
    initialize: Object.assign(sdk.initialize, {
      isSupported: () => sdk.supported,
    }),
    attachBanner: Object.assign(vi.fn(), { isSupported: () => sdk.supported }),
  },
}));

beforeEach(() => {
  vi.resetModules();
  sdk.version = "5.247.0";
  sdk.supported = true;
  sdk.initialize.mockReset();
});

describe("banner initialization", () => {
  it("shares one pending initialization across menus and StrictMode effects", async () => {
    const { initializeBannerAds } = await import("../../src/data/bannerAds");
    const first = initializeBannerAds();
    const second = initializeBannerAds();
    expect(first).toBe(second);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
    sdk.initialize.mock.calls[0][0].callbacks.onInitialized();
    await expect(first).resolves.toBe(true);
    await expect(initializeBannerAds()).resolves.toBe(true);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
  });
  it.each(["5.240.0", "5.99.0", "", "invalid"])(
    "does not initialize on unsupported version %s",
    async (version) => {
      sdk.version = version;
      const { initializeBannerAds } = await import("../../src/data/bannerAds");
      await expect(initializeBannerAds()).resolves.toBe(false);
      expect(sdk.initialize).not.toHaveBeenCalled();
    },
  );
  it("does not initialize outside a supported Toss environment", async () => {
    sdk.supported = false;
    const { initializeBannerAds } = await import("../../src/data/bannerAds");
    await expect(initializeBannerAds()).resolves.toBe(false);
    expect(sdk.initialize).not.toHaveBeenCalled();
  });
  it("handles initialization failure without retries on every menu", async () => {
    sdk.initialize.mockImplementation(({ callbacks }) =>
      callbacks.onInitializationFailed(new Error("offline")),
    );
    const { initializeBannerAds } = await import("../../src/data/bannerAds");
    await expect(initializeBannerAds()).resolves.toBe(false);
    await expect(initializeBannerAds()).resolves.toBe(false);
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
  });
});
