import { afterEach, describe, expect, it, vi } from "vitest";
import { getExportAdGroupId } from "../../src/data/exportAdConfig";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("server-provided export ad group", () => {
  it.each([true, false])(
    "reads the API configuration even when DEV=%s, without a test-ID fallback",
    async (dev) => {
      vi.stubEnv("DEV", dev);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({
              status: "ok",
              exportRewardedAdGroupId: " configured-export-group ",
            }),
          ),
        );
      vi.stubGlobal("fetch", fetcher);
      expect(await getExportAdGroupId()).toBe("configured-export-group");
      expect(fetcher.mock.calls[0][0]).toMatch(/\/api\/ads$/);
      expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
    },
  );
  it("leaves export locked when the server ID is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response('{"status":"ok","exportRewardedAdGroupId":null}'),
        ),
    );
    expect(await getExportAdGroupId()).toBe("");
  });
  it.each([
    new Response("unavailable", { status: 503 }),
    new Response('{"status":"ok","exportRewardedAdGroupId":12}'),
  ])("rejects an unavailable or invalid configuration", async (response) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    await expect(getExportAdGroupId()).rejects.toThrow();
  });
  it("forwards cancellation when the export screen is left", async () => {
    let actualSignal: AbortSignal | undefined;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        actualSignal = init?.signal ?? undefined;
        return new Promise((_resolve, reject) =>
          actualSignal!.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      });
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = getExportAdGroupId(controller.signal);
    const rejected = expect(result).rejects.toThrow("aborted");
    controller.abort();
    await rejected;
    expect(actualSignal!.aborted).toBe(true);
  });
});
