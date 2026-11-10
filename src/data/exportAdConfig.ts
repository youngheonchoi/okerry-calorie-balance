import { z } from "zod";

const baseUrl = (
  import.meta.env.VITE_CALORIE_API_URL?.trim() ||
  "https://okerry-calorie-balance-api.vercel.app"
).replace(/\/$/, "");
const schema = z.object({
  status: z.literal("ok"),
  exportRewardedAdGroupId: z.string().nullable(),
});

// Public ad configuration only: no user auth, wallet lookup, or credit grants.
export async function getExportAdGroupId(
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 8000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    const response = await fetch(`${baseUrl}/api/ads`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Export ads unavailable");
    return (
      schema.parse(await response.json()).exportRewardedAdGroupId?.trim() || ""
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
