import { Clipboard, File as TossFile } from "@apps-in-toss/web-framework";

export function csvBase64(csv: string): string {
  const bytes = new TextEncoder().encode(csv);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(binary);
}

export function canSaveRecordCsv(): boolean {
  try {
    return import.meta.env.DEV || TossFile.saveBase64.isSupported();
  } catch {
    return false;
  }
}

export async function saveRecordCsv(
  csv: string,
  fileName: string,
): Promise<void> {
  if (import.meta.env.DEV) {
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!TossFile.saveBase64.isSupported())
    throw new Error("파일 저장을 지원하는 최신 토스 앱에서 다시 시도해주세요.");
  await TossFile.saveBase64({
    data: csvBase64(csv),
    fileName,
    mimeType: "text/csv",
  });
}

export async function copyRecordPrompt(text: string): Promise<void> {
  if (import.meta.env.DEV) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const permission = await Clipboard.setText.getPermission();
  if (
    permission !== "allowed" &&
    (await Clipboard.setText.openPermissionDialog()) !== "allowed"
  )
    throw new Error(
      "복사 권한을 허용하거나, 아래 내용을 길게 눌러 직접 복사해주세요.",
    );
  await Clipboard.setText(text);
}
