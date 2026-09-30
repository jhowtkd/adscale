import { describe, expect, it, vi } from "vitest";
import {
  MAX_CHAT_ATTACHMENTS,
  collectImageFiles,
  remainingAttachmentSlots,
  uploadChatAttachment,
} from "./chat-attachments";

describe("chat-attachments helpers", () => {
  it("collects only allowed image mime types", () => {
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.pdf", { type: "application/pdf" }),
      new File(["c"], "c.jpg", { type: "image/jpeg" }),
    ];

    const collected = collectImageFiles(files);
    expect(collected).toHaveLength(2);
    expect(collected.map((file) => file.name)).toEqual(["a.png", "c.jpg"]);
  });

  it("computes remaining slots up to the API max", () => {
    expect(MAX_CHAT_ATTACHMENTS).toBe(5);
    expect(remainingAttachmentSlots(0)).toBe(5);
    expect(remainingAttachmentSlots(4)).toBe(1);
    expect(remainingAttachmentSlots(5)).toBe(0);
  });

  it.each([undefined, "00000000-0000-4000-8000-000000000001"])("sends optional handoff context in the real upload request: %s", async (handoffId) => {
    const file = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "logo.png", { type: "image/png" });
    const request = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ asset: { id: "asset", key: "managed/logo.png", url: "/logo.png", type: "image/png", name: "logo.png", size: 8 } }));
    vi.stubGlobal("fetch", request);
    try {
      const asset = await uploadChatAttachment(file, handoffId);
      expect(asset.key).toBe("managed/logo.png");
      const body = request.mock.calls[0]![1]!.body as FormData;
      expect(body.get("handoffId")).toBe(handoffId ?? null);
      expect(body.get("file")).toBeInstanceOf(File);
    } finally { vi.unstubAllGlobals(); }
  });
});
