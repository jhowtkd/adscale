import { describe, expect, it } from "vitest";
import { InMemoryObjectStorage } from "./in-memory-object-storage";

describe("InMemoryObjectStorage", () => {
  it("stores, reads, heads, and deletes objects", async () => {
    const storage = new InMemoryObjectStorage();
    const data = Buffer.from("hello");

    await storage.put("assets/logo.png", data, "image/png");

    await expect(storage.get("assets/logo.png")).resolves.toEqual(data);
    await expect(storage.head("assets/logo.png")).resolves.toEqual({
      contentType: "image/png",
      contentLength: data.length,
    });
    expect(storage.publicUrl("assets/logo.png")).toBe("memory://public/assets/logo.png");
    await expect(storage.signedUploadUrl("assets/logo.png", "image/png", data.length)).resolves.toBe(
      "memory://upload/assets/logo.png"
    );
    await expect(storage.signedDownloadUrl("assets/logo.png")).resolves.toBe(
      "memory://download/assets/logo.png"
    );

    await storage.delete("assets/logo.png");

    await expect(storage.head("assets/logo.png")).resolves.toBeNull();
    await expect(storage.get("assets/logo.png")).rejects.toThrow("Object not found");
  });

  it("clears stored objects between tests", async () => {
    const storage = new InMemoryObjectStorage();

    await storage.put("one", Buffer.from("one"), "text/plain");
    await storage.put("two", Buffer.from("two"), "text/plain");
    expect(storage.keys()).toEqual(["one", "two"]);

    storage.clear();

    expect(storage.keys()).toEqual([]);
  });
});
