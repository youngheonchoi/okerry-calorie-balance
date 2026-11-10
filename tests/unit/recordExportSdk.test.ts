import { afterEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  save: vi.fn(),
  supported: vi.fn(),
  copy: vi.fn(),
  permission: vi.fn(),
  dialog: vi.fn(),
}));
vi.mock("@apps-in-toss/web-framework", () => ({
  File: { saveBase64: Object.assign(sdk.save, { isSupported: sdk.supported }) },
  Clipboard: {
    setText: Object.assign(sdk.copy, {
      getPermission: sdk.permission,
      openPermissionDialog: sdk.dialog,
    }),
  },
}));
import {
  canSaveRecordCsv,
  copyRecordPrompt,
  csvBase64,
  saveRecordCsv,
} from "../../src/data/recordExport";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe("native record export", () => {
  it("saves Korean CSV as UTF-8 base64 with a CSV file name and MIME type", async () => {
    vi.stubEnv("DEV", false);
    sdk.supported.mockReturnValue(true);
    sdk.save.mockResolvedValue(undefined);
    const csv = '\uFEFF음식명,메모\r\n사과,"운동 후 🍎"';
    await saveRecordCsv(csv, "records.csv");
    const encoded = sdk.save.mock.calls[0][0];
    expect(encoded).toMatchObject({
      fileName: "records.csv",
      mimeType: "text/csv",
    });
    const bytes = Uint8Array.from(atob(encoded.data), (char) =>
      char.charCodeAt(0),
    );
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes)).toBe(
      csv,
    );
    expect(csvBase64(csv)).toBe(encoded.data);
  });
  it("does not claim a save when the native API is unsupported", async () => {
    vi.stubEnv("DEV", false);
    sdk.supported.mockReturnValue(false);
    expect(canSaveRecordCsv()).toBe(false);
    await expect(saveRecordCsv("내용", "records.csv")).rejects.toThrow();
    expect(sdk.save).not.toHaveBeenCalled();
  });
  it("copies through the SDK without prompting when write permission is already granted", async () => {
    vi.stubEnv("DEV", false);
    sdk.permission.mockResolvedValue("allowed");
    await copyRecordPrompt("프롬프트");
    expect(sdk.copy).toHaveBeenCalledWith("프롬프트");
    expect(sdk.dialog).not.toHaveBeenCalled();
  });
  it.each(["allowed", "denied"])(
    "requests clipboard permission and handles %s",
    async (permission) => {
      vi.stubEnv("DEV", false);
      sdk.permission.mockResolvedValue("notDetermined");
      sdk.dialog.mockResolvedValue(permission);
      if (permission === "allowed") {
        await copyRecordPrompt("내용");
        expect(sdk.copy).toHaveBeenCalledWith("내용");
      } else {
        await expect(copyRecordPrompt("내용")).rejects.toThrow("복사 권한");
        expect(sdk.copy).not.toHaveBeenCalled();
      }
    },
  );
});
