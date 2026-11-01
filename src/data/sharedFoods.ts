import { Storage, User } from "@apps-in-toss/web-framework";
import { createFoodSync } from "./foodSync";

const baseUrl = (
  import.meta.env.VITE_CALORIE_API_URL?.trim() ||
  "https://okerry-calorie-balance-api.vercel.app"
).replace(/\/$/, "");

export const registerSharedFood = createFoodSync({
  baseUrl,
  store: Storage,
  createAuthCode: () => User.createAnonymousKeyAuthCode(),
});
