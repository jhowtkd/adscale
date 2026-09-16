import { describe, expect, it, vi } from "vitest";
import { resolvePreviewUrl } from "./previews";

describe("resolvePreviewUrl", () => {
  it("prefere imagem, cai para thumb, null sem mídia", async () => {
    const storage = { signedDownloadUrl: vi.fn(async (key: string) => `signed:${key}`) };
    await expect(resolvePreviewUrl({ imageKey: "img", thumbKey: "th" }, storage)).resolves.toBe(
      "signed:img"
    );
    await expect(resolvePreviewUrl({ thumbKey: "th" }, storage)).resolves.toBe("signed:th");
    await expect(resolvePreviewUrl({}, storage)).resolves.toBeNull();
    expect(storage.signedDownloadUrl).toHaveBeenCalledTimes(2);
  });

  it("falha de assinatura vira null", async () => {
    const storage = { signedDownloadUrl: vi.fn(async () => { throw new Error("r2"); }) };
    await expect(resolvePreviewUrl({ imageKey: "img" }, storage)).resolves.toBeNull();
  });
});
