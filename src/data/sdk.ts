import { Storage } from "@apps-in-toss/web-framework";
import { createRepository } from "./repository";
export const repository = createRepository(Storage);
let draftQueue: Promise<unknown> = Promise.resolve();
function queueDraft<T>(operation: () => Promise<T>): Promise<T> {
  const next = draftQueue.then(operation, operation);
  draftQueue = next.catch(() => undefined);
  return next;
}
export const draftStore = {
  get: () => queueDraft(() => Storage.getItem("calorie_wallet_draft")),
  set: (value: string) =>
    queueDraft(() => Storage.setItem("calorie_wallet_draft", value)),
  clear: () => queueDraft(() => Storage.removeItem("calorie_wallet_draft")),
};
export const homeDetailsStore = {
  get: () => Storage.getItem("calorie_wallet_home_details_open"),
  set: (value: boolean) =>
    Storage.setItem("calorie_wallet_home_details_open", String(value)),
};
