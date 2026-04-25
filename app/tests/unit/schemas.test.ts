import { describe, it, expect } from "vitest";
import { z } from "zod";

const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().optional(),
  product: z.string().optional(),
  objective: z.string().optional(),
  audience: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  tone: z.string().optional(),
  offer: z.string().optional(),
  constraints: z.string().optional(),
  notes: z.string().optional(),
});

const presignSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().int().positive(),
});

const planApprovalSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const derivationReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

const exportRequestSchema = z.object({
  type: z.enum(["individual", "batch"]),
  derivationId: z.string().optional(),
  campaignId: z.string().optional(),
  format: z.enum(["png", "jpeg", "webp"]),
});

describe("campaign creation schema", () => {
  it("accepts valid campaign input", () => {
    const result = createCampaignSchema.safeParse({
      name: "Summer Sale",
      client: "Acme",
      platforms: ["facebook", "instagram"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createCampaignSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects name over 255 chars", () => {
    const result = createCampaignSchema.safeParse({ name: "a".repeat(256) });
    expect(result.success).toBe(false);
  });
});

describe("asset upload schema", () => {
  it("accepts valid presign input", () => {
    const result = presignSchema.safeParse({
      filename: "hero.png",
      contentType: "image/png",
      contentLength: 1024,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing filename", () => {
    const result = presignSchema.safeParse({
      contentType: "image/png",
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative contentLength", () => {
    const result = presignSchema.safeParse({
      filename: "hero.png",
      contentType: "image/png",
      contentLength: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("plan approval schema", () => {
  it("accepts approved status", () => {
    const result = planApprovalSchema.safeParse({ status: "approved" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = planApprovalSchema.safeParse({ status: "pending" });
    expect(result.success).toBe(false);
  });
});

describe("derivation review schema", () => {
  it("accepts rejected status", () => {
    const result = derivationReviewSchema.safeParse({ status: "rejected" });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = derivationReviewSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("export request schema", () => {
  it("accepts valid individual export", () => {
    const result = exportRequestSchema.safeParse({
      type: "individual",
      derivationId: "123",
      format: "png",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid batch export", () => {
    const result = exportRequestSchema.safeParse({
      type: "batch",
      campaignId: "456",
      format: "webp",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid format", () => {
    const result = exportRequestSchema.safeParse({
      type: "individual",
      format: "gif",
    });
    expect(result.success).toBe(false);
  });
});
