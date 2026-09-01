import { describe, it, expect } from "vitest";
import { createBetaEventBodySchema } from "./types";
import {
  BetaEventPropertiesValidationError,
  MAX_PROPERTIES_BYTES,
  sanitizeBetaEventProperties,
} from "./sanitize";

describe("sanitizeBetaEventProperties", () => {
  it("accepts allowlisted scalar properties", () => {
    const result = sanitizeBetaEventProperties({
      stage: "briefing",
      missionKey: "first_campaign",
      blockingCount: 2,
      estimateCredits: 10,
      actualCredits: 8,
      isPreview: true,
      durationMs: 1500,
      reasonCode: null,
    });

    expect(result).toEqual({
      stage: "briefing",
      missionKey: "first_campaign",
      blockingCount: 2,
      estimateCredits: 10,
      actualCredits: 8,
      isPreview: true,
      durationMs: 1500,
      reasonCode: null,
    });
  });

  it("accepts empty properties", () => {
    expect(sanitizeBetaEventProperties({})).toEqual({});
  });

  it("accepts v11.11 tokenId and blockingDimensions properties", () => {
    expect(
      sanitizeBetaEventProperties({
        tokenId: "abcd1234",
        blockingDimensions: "offerClarity,ctaProminence",
      })
    ).toEqual({
      tokenId: "abcd1234",
      blockingDimensions: "offerClarity,ctaProminence",
    });
  });

  it("accepts Phase 126 output learning scalar properties", () => {
    expect(
      sanitizeBetaEventProperties({
        traceId: "ol-trace-1",
        evidenceEventCount: 3,
        blockedFieldCount: 0,
      })
    ).toEqual({
      traceId: "ol-trace-1",
      evidenceEventCount: 3,
      blockedFieldCount: 0,
    });
  });

  it("rejects non-scalar values for output learning properties", () => {
    expect(() =>
      sanitizeBetaEventProperties({
        traceId: { nested: true } as unknown as string,
      })
    ).toThrow(BetaEventPropertiesValidationError);
    expect(() =>
      sanitizeBetaEventProperties({
        evidenceEventCount: ["3"] as unknown as number,
      })
    ).toThrow(BetaEventPropertiesValidationError);
    expect(() =>
      sanitizeBetaEventProperties({
        blockedFieldCount: { count: 1 } as unknown as number,
      })
    ).toThrow(BetaEventPropertiesValidationError);
  });

  it("rejects unknown property keys with validation_error", () => {
    expect(() =>
      sanitizeBetaEventProperties({ stage: "briefing", foo: "bar" })
    ).toThrow(BetaEventPropertiesValidationError);

    try {
      sanitizeBetaEventProperties({ stage: "briefing", foo: "bar" });
    } catch (error) {
      expect(error).toBeInstanceOf(BetaEventPropertiesValidationError);
      expect((error as BetaEventPropertiesValidationError).code).toBe(
        "validation_error"
      );
    }
  });

  it("rejects unknown key even when mixed with allowlisted keys", () => {
    expect(() =>
      sanitizeBetaEventProperties({ stage: "briefing", prompt: "secret" })
    ).toThrow(BetaEventPropertiesValidationError);
  });

  it("rejects prompt/email/url keys explicitly", () => {
    for (const key of ["prompt", "email", "message", "url", "assetUrl", "token"]) {
      expect(() => sanitizeBetaEventProperties({ [key]: "value" })).toThrow(
        BetaEventPropertiesValidationError
      );
    }
  });

  it("rejects denied keys with details listing deniedKeys", () => {
    try {
      sanitizeBetaEventProperties({ email: "user@example.com" });
      expect.fail("expected validation error");
    } catch (error) {
      expect(error).toBeInstanceOf(BetaEventPropertiesValidationError);
      const details = (error as BetaEventPropertiesValidationError).details as {
        deniedKeys?: string[];
      };
      expect(details.deniedKeys).toContain("email");
    }
  });

  it("rejects nested object values", () => {
    expect(() =>
      sanitizeBetaEventProperties({ stage: { nested: true } as unknown as string })
    ).toThrow(BetaEventPropertiesValidationError);
  });

  it("rejects array values", () => {
    expect(() =>
      sanitizeBetaEventProperties({ stage: ["briefing"] as unknown as string })
    ).toThrow(BetaEventPropertiesValidationError);
  });

  it("rejects oversized payload", () => {
    const hugeValue = "x".repeat(MAX_PROPERTIES_BYTES);
    expect(() => sanitizeBetaEventProperties({ stage: hugeValue })).toThrow(
      BetaEventPropertiesValidationError
    );
  });

  it("rejects non-object input", () => {
    expect(() => sanitizeBetaEventProperties("not-an-object")).toThrow(
      BetaEventPropertiesValidationError
    );
    expect(() => sanitizeBetaEventProperties(null)).toThrow(
      BetaEventPropertiesValidationError
    );
    expect(() => sanitizeBetaEventProperties([])).toThrow(
      BetaEventPropertiesValidationError
    );
  });

  it("accepts Studio entry interview scalars and rejects arrays for slots", () => {
    expect(sanitizeBetaEventProperties({
      workCount: 3,
      slots: "protocol,offer",
      usedFallback: true,
      slot: "offer",
      requestSource: "template",
    })).toMatchObject({ slots: "protocol,offer", requestSource: "template" });
    expect(() => sanitizeBetaEventProperties({
      slots: ["protocol"] as unknown as string,
    })).toThrow(BetaEventPropertiesValidationError);
  });
});

describe("createBetaEventBodySchema", () => {
  it("accepts valid snake_case eventKey", () => {
    const result = createBetaEventBodySchema.safeParse({
      eventKey: "mission_started",
      properties: {},
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid eventKey formats", () => {
    for (const eventKey of ["MissionStarted", "mission-started", "", "a".repeat(65)]) {
      const result = createBetaEventBodySchema.safeParse({ eventKey, properties: {} });
      expect(result.success).toBe(false);
    }
  });

  it("accepts optional UUID fields", () => {
    const result = createBetaEventBodySchema.safeParse({
      eventKey: "mission_started",
      sessionId: "550e8400-e29b-41d4-a716-446655440000",
      campaignId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      derivationId: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID fields", () => {
    const result = createBetaEventBodySchema.safeParse({
      eventKey: "mission_started",
      sessionId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("defaults properties to empty object", () => {
    const result = createBetaEventBodySchema.safeParse({
      eventKey: "mission_started",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.properties).toEqual({});
    }
  });
});
