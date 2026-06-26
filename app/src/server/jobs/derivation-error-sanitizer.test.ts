import { describe, it, expect } from "vitest";
import { sanitizeDerivationFailureError, DERIVATION_USER_SAFE_ERROR } from "./derivation-error-sanitizer";

describe("sanitizeDerivationFailureError", () => {
  it("returns a safe user message for SQL-like failures", () => {
    const result = sanitizeDerivationFailureError(
      new Error('relation "client_profile_olhar_config" does not exist')
    );

    expect(result.userMessage).toBe(DERIVATION_USER_SAFE_ERROR);
    expect(result.technicalDetail).toContain("client_profile_olhar_config");
  });

  it("never exposes technical detail in userMessage", () => {
    const result = sanitizeDerivationFailureError(
      new Error("syntax error at or near SELECT")
    );

    expect(result.userMessage).toBe(DERIVATION_USER_SAFE_ERROR);
    expect(result.userMessage).not.toMatch(/select|syntax/i);
  });
});
