import { beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  saveBase64: Object.assign(vi.fn(), { isSupported: vi.fn(() => true) }),
}));
vi.mock("@apps-in-toss/web-framework", () => ({
  Storage: {},
  File: { saveBase64: sdk.saveBase64 },
}));
import { exportBackup } from "../../src/data/sdk";
import { parseBackup } from "../../src/domain/validation";
import { fixture } from "../fixtures";
describe("native JSON export", () => {
  beforeEach(() => {
    sdk.saveBase64.mockReset();
    sdk.saveBase64.isSupported.mockReturnValue(true);
  });
  it("encodes all data and Korean characters as UTF-8 Base64", async () => {
    const w = fixture();
    w.profile!.lifestyle.other = "계단 오르기";
    await exportBackup(w);
    const args = sdk.saveBase64.mock.calls[0][0];
    expect(args.mimeType).toBe("application/json");
    expect(args.fileName).toMatch(
      /^calorie-wallet-backup-\d{4}-\d{2}-\d{2}\.json$/,
    );
    expect(
      parseBackup(Buffer.from(args.data, "base64").toString("utf8")).wallet,
    ).toEqual(w);
  });
  it("does not claim success when native saving fails", async () => {
    sdk.saveBase64.mockRejectedValue(new Error("save failed"));
    await expect(exportBackup(fixture())).rejects.toThrow("save failed");
  });
  it("rejects unsupported app versions before calling the API", async () => {
    sdk.saveBase64.isSupported.mockReturnValue(false);
    await expect(exportBackup(fixture())).rejects.toThrow("업데이트");
    expect(sdk.saveBase64).not.toHaveBeenCalled();
  });
});
