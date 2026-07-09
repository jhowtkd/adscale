import { describe, expect, it } from "vitest";
import {
  MAX_CHAT_ATTACHMENTS,
  collectImageFiles,
  remainingAttachmentSlots,
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
});
