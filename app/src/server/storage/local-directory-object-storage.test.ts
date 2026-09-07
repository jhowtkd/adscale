import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { e2eStorageRoot, LocalDirectoryObjectStorage } from "./local-directory-object-storage";

describe("LocalDirectoryObjectStorage", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    delete process.env.E2E_STORAGE_DIR;
  });

  it("shares objects across instances via E2E_STORAGE_DIR", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "adscale-e2e-storage-"));
    process.env.E2E_STORAGE_DIR = dir;
    expect(e2eStorageRoot()).toBe(path.resolve(dir));

    const writer = new LocalDirectoryObjectStorage();
    const reader = new LocalDirectoryObjectStorage();
    const payload = Buffer.from("shared-bytes");
    await writer.put("works/a.png", payload, "image/png");

    await expect(reader.get("works/a.png")).resolves.toEqual(payload);
    await expect(reader.head("works/a.png")).resolves.toEqual({
      contentType: "image/png",
      contentLength: payload.length,
    });
  });

  it("rejects path traversal in object keys", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "adscale-e2e-storage-"));
    process.env.E2E_STORAGE_DIR = dir;
    const storage = new LocalDirectoryObjectStorage();
    await storage.put("../escape.png", Buffer.from("x"), "image/png");
    await expect(storage.get("../escape.png")).resolves.toEqual(Buffer.from("x"));
    await expect(storage.get("escape.png")).resolves.toEqual(Buffer.from("x"));
  });
});
