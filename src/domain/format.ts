import { ZodError } from "zod";
export const kcal = (value: number) =>
  `${Math.round(value).toLocaleString("ko-KR")} kcal`;
export const balanceText = (value: number) =>
  value < 0
    ? `${kcal(-value)} 적자`
    : value > 0
      ? `${kcal(value)} 흑자`
      : "균형 0 kcal";
export function errorMessage(error: unknown): string {
  if (error instanceof ZodError)
    return error.issues
      .slice(0, 2)
      .map((i) => i.message)
      .join(" / ");
  return error instanceof Error
    ? error.message
    : "처리하지 못했어요. 다시 시도해주세요.";
}
