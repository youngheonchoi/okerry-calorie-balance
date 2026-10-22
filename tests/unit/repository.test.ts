import { describe, expect, it } from "vitest";
import { createRepository, type Store } from "../../src/data/repository";
import { fixture } from "../fixtures";
const fields = [
  "profile",
  "tdee_history",
  "goal_history",
  "cycle_history",
  "meals",
  "exercises",
  "weights",
  "meta",
];
class MemoryStore implements Store {
  data = new Map<string, string>();
  failOn: string | null = null;
  failAll = false;
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    if (this.failAll) throw new Error("offline");
    if (this.failOn === key) {
      this.failOn = null;
      throw new Error("write failed");
    }
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    if (this.failAll) throw new Error("offline");
    if (this.failOn === key) {
      this.failOn = null;
      throw new Error("remove failed");
    }
    this.data.delete(key);
  }
}
describe("Storage transaction recovery", () => {
  it("starts empty and round-trips all eight JSON keys", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store);
    expect(await repo.load()).toBeNull();
    const w = fixture();
    await repo.save(w);
    expect(await repo.load()).toEqual(w);
    expect(store.data.size).toBe(8);
    for (const value of store.data.values())
      expect(JSON.parse(value).schemaVersion).toBe(1);
  });
  it.each(fields)(
    "restores original data if %s fails mid-save",
    async (field) => {
      const store = new MemoryStore(),
        repo = createRepository(store),
        before = fixture();
      await repo.save(before);
      store.failOn = `calorie_wallet_${field}`;
      const next = structuredClone(before);
      next.meta.completedDays = ["2026-10-01"];
      await expect(repo.save(next)).rejects.toThrow();
      expect(await repo.load()).toEqual(before);
      expect(store.data.has("calorie_wallet_transaction")).toBe(false);
    },
  );
  it("recovers a process interruption from the durable snapshot on next launch", async () => {
    const store = new MemoryStore(),
      before = fixture();
    await createRepository(store).save(before);
    const snapshot = Object.fromEntries(
      fields.map((f) => [f, store.data.get(`calorie_wallet_${f}`)]),
    );
    store.data.set("calorie_wallet_transaction", JSON.stringify(snapshot));
    store.data.set("calorie_wallet_profile", "broken partial write");
    expect(await createRepository(store).load()).toEqual(before);
  });
  it("leaves a recovery journal when rollback also fails, then recovers later", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store),
      before = fixture();
    await repo.save(before);
    const originalSet = store.setItem.bind(store);
    store.setItem = async (k, v) => {
      if (k === "calorie_wallet_meals") store.failAll = true;
      await originalSet(k, v);
    };
    await expect(repo.save(before)).rejects.toThrow("복구");
    expect(store.data.has("calorie_wallet_transaction")).toBe(true);
    store.failAll = false;
    store.setItem = originalSet;
    expect(await createRepository(store).load()).toEqual(before);
  });
  it("does not mutate storage when incoming data fails validation", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store),
      before = fixture();
    await repo.save(before);
    const snapshot = Array.from(store.data);
    await expect(
      repo.save({ ...before, schemaVersion: 2 } as never),
    ).rejects.toThrow();
    expect(Array.from(store.data)).toEqual(snapshot);
  });
  it("serializes competing writes and preserves unrelated keys on reset", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store),
      first = fixture(),
      last = structuredClone(first);
    last.meta.completedDays = ["2026-10-01"];
    await Promise.all([repo.save(first), repo.save(last)]);
    expect(await repo.load()).toEqual(last);
    store.data.set("other_app", "keep");
    await repo.reset();
    expect(await repo.load()).toBeNull();
    expect(store.data.get("other_app")).toBe("keep");
  });
  it("preserves existing data on reset failure", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store),
      w = fixture();
    await repo.save(w);
    store.failOn = "calorie_wallet_goal_history";
    await expect(repo.reset()).rejects.toThrow();
    expect(await repo.load()).toEqual(w);
  });
  it("reports incomplete or incompatible local storage without overwriting it", async () => {
    const store = new MemoryStore(),
      repo = createRepository(store),
      w = fixture();
    await repo.save(w);
    store.data.delete("calorie_wallet_weights");
    const before = Array.from(store.data);
    await expect(repo.load()).rejects.toThrow("일부");
    expect(Array.from(store.data)).toEqual(before);
  });
});
