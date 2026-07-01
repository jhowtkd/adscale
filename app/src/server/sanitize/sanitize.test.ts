import { describe, it, expect } from "vitest";
import {
  FEEDBACK_MESSAGE_MAX_LENGTH,
  MAX_TELEMETRY_BYTES,
  enforcePayloadSize,
  isSensitiveKey,
  sanitizeDeepValue,
  sanitizeDiagnosticContext,
  sanitizeForTelemetry,
  truncateString,
} from "./index";
import { BetaEventPropertiesValidationError } from "@/server/beta-analytics/sanitize";

describe("telemetry sanitizer core", () => {
  describe("isSensitiveKey", () => {
    it("matches regex-based sensitive keys", () => {
      for (const key of ["authToken", "apiKey", "api_key", "password", "prompt"]) {
        expect(isSensitiveKey(key)).toBe(true);
      }
    });

    it("allows explicit beta denylist keys in deep sanitization", () => {
      for (const key of ["email", "note", "breadcrumbs", "url"]) {
        expect(isSensitiveKey(key)).toBe(false);
      }
    });

    it("allows benign keys", () => {
      expect(isSensitiveKey("route")).toBe(false);
      expect(isSensitiveKey("stage")).toBe(false);
      expect(isSensitiveKey("missionKey")).toBe(false);
    });
  });

  describe("sanitizeDeepValue", () => {
    it("removes sensitive keys at top level", () => {
      const result = sanitizeDeepValue({
        route: "/home",
        authToken: "secret",
        prompt: "full prompt",
      }) as Record<string, unknown>;

      expect(result.route).toBe("/home");
      expect(result.authToken).toBeUndefined();
      expect(result.prompt).toBeUndefined();
    });

    it("removes nested sensitive keys", () => {
      const result = sanitizeDeepValue({
        meta: {
          token: "nested-secret",
          ok: "value",
        },
      }) as Record<string, Record<string, unknown>>;

      expect(result.meta.ok).toBe("value");
      expect(result.meta.token).toBeUndefined();
    });

    it("sanitizes arrays and drops undefined entries", () => {
      const result = sanitizeDeepValue([
        { type: "nav", path: "/a" },
        { password: "x", type: "auth" },
      ]) as unknown[];

      expect(result).toHaveLength(2);
      expect((result[1] as Record<string, unknown>).type).toBe("auth");
      expect((result[1] as Record<string, unknown>).password).toBeUndefined();
    });

    it("handles unknown primitives without crashing", () => {
      expect(sanitizeDeepValue(null)).toBe(null);
      expect(sanitizeDeepValue(42)).toBe(42);
      expect(sanitizeDeepValue(true)).toBe(true);
    });
  });

  describe("truncateString", () => {
    it("truncates long strings with ellipsis", () => {
      const long = "a".repeat(600);
      expect(truncateString(long)).toHaveLength(501);
    });
  });

  describe("enforcePayloadSize", () => {
    it("keeps payload within cap", () => {
      const payload = { route: "/ok" };
      expect(enforcePayloadSize(payload, MAX_TELEMETRY_BYTES)).toEqual(payload);
    });

    it("trims breadcrumbs when payload exceeds cap", () => {
      const hugeBreadcrumbs = Array.from({ length: 100 }, (_, index) => ({
        type: "fetch",
        detail: "x".repeat(800),
        index,
      }));

      const result = enforcePayloadSize(
        { breadcrumbs: hugeBreadcrumbs },
        MAX_TELEMETRY_BYTES
      ) as Record<string, unknown>;

      expect(JSON.stringify(result).length).toBeLessThanOrEqual(MAX_TELEMETRY_BYTES);
    });
  });

  describe("sanitizeDiagnosticContext", () => {
    it("enforces 32KB cap on diagnostic payloads", () => {
      const hugeBreadcrumbs = Array.from({ length: 100 }, (_, index) => ({
        type: "fetch",
        detail: "x".repeat(800),
        index,
      }));

      const json = JSON.stringify(
        sanitizeDiagnosticContext({ breadcrumbs: hugeBreadcrumbs })
      );
      expect(json.length).toBeLessThanOrEqual(MAX_TELEMETRY_BYTES);
    });
  });

  describe("sanitizeForTelemetry", () => {
    it("routes feedback kind to diagnostic sanitizer", () => {
      const result = sanitizeForTelemetry(
        { route: "/x", prompt: "secret" },
        { kind: "feedback" }
      );

      expect(result.route).toBe("/x");
      expect(result.prompt).toBeUndefined();
    });

    it("routes beta_event kind to property validator", () => {
      const result = sanitizeForTelemetry(
        { stage: "briefing", blockingCount: 1 },
        { kind: "beta_event" }
      );

      expect(result).toEqual({ stage: "briefing", blockingCount: 1 });
    });

    it("rejects denied keys for beta_event kind", () => {
      expect(() =>
        sanitizeForTelemetry({ email: "user@example.com" }, { kind: "beta_event" })
      ).toThrow(BetaEventPropertiesValidationError);
    });

    it("routes mission_insight kind to mission sanitizer", () => {
      const result = sanitizeForTelemetry(null, {
        kind: "mission_insight",
        input: {
          moment: "preview_first",
          missionKey: "preview",
          action: "dismissed",
        },
      });

      expect(result).toMatchObject({
        moment: "preview_first",
        missionKey: "preview",
        action: "dismissed",
      });
    });
  });

  it("exports feedback message max length constant", () => {
    expect(FEEDBACK_MESSAGE_MAX_LENGTH).toBe(4000);
  });
});
