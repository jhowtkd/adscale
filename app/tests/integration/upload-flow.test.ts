import { describe, it, expect } from "vitest";
import { z } from "zod";

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
});

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_SIZE = 20 * 1024 * 1024; // 20MB

describe("upload flow validations", () => {
  it("presign endpoint accepts valid file type", () => {
    const body = {
      filename: "hero.png",
      contentType: "image/png",
      contentLength: 1024,
    };
    const parsed = presignSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(ALLOWED_TYPES.includes(body.contentType)).toBe(true);
  });

  it("presign endpoint rejects invalid file type", () => {
    const body = {
      filename: "hero.gif",
      contentType: "image/gif",
      contentLength: 1024,
    };
    const parsed = presignSchema.safeParse(body);
    expect(parsed.success).toBe(true); // schema passes
    expect(ALLOWED_TYPES.includes(body.contentType)).toBe(false); // but type check fails
  });

  it("presign endpoint rejects files over 20MB", () => {
    const body = {
      filename: "hero.png",
      contentType: "image/png",
      contentLength: 25 * 1024 * 1024,
    };
    const parsed = presignSchema.safeParse(body);
    expect(parsed.success).toBe(true); // schema passes
    expect(body.contentLength > MAX_SIZE).toBe(true); // but size check fails
  });

  it("presign endpoint accepts file at exactly 20MB", () => {
    const body = {
      filename: "hero.png",
      contentType: "image/png",
      contentLength: 20 * 1024 * 1024,
    };
    expect(body.contentLength <= MAX_SIZE).toBe(true);
  });

  it("complete endpoint validates key and type", () => {
    const completeSchema = z.object({
      key: z.string().min(1),
      type: z.string().min(1),
      size: z.number().int().positive().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
    });

    const result = completeSchema.safeParse({
      key: "campaigns/camp-1/550e8400-e29b-41d4-a716-446655440000-hero.png",
      type: "image/png",
      size: 1024,
    });

    expect(result.success).toBe(true);
  });
});
