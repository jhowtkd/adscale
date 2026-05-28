import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage } from "./in-memory-object-storage";
import { deleteKeys } from "./storage-helpers";

describe("deleteKeys", () => {
  it("deletes every requested key and reports successes", async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put("one", Buffer.from("one"), "text/plain");
    await storage.put("two", Buffer.from("two"), "text/plain");

    const result = await deleteKeys(storage, ["one", "two"]);

    expect(result).toEqual({ succeeded: ["one", "two"], failed: [] });
    expect(storage.keys()).toEqual([]);
  });

  it("keeps deleting remaining keys when one delete fails", async () => {
    const storage = new InMemoryObjectStorage();
    await storage.put("ok", Buffer.from("ok"), "text/plain");

    const failingStorage = {
      ...storage,
      delete: async (key: string) => {
        if (key === "bad") {
          throw new Error("delete failed");
        }
        await storage.delete(key);
      },
    };

    const result = await deleteKeys(failingStorage, ["bad", "ok"]);

    expect(result.succeeded).toEqual(["ok"]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].key).toBe("bad");
    expect(result.failed[0].error.message).toBe("delete failed");
    expect(storage.keys()).toEqual([]);
  });
});
