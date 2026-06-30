import { describe, expect, it } from "vitest";
import { shouldShowAutoRetryBadge } from "./derivation-display";

describe("shouldShowAutoRetryBadge", () => {
  it("is hidden unless flag is enabled and retry was attempted", () => {
    const original = process.env.NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE;

    process.env.NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE = "false";
    expect(shouldShowAutoRetryBadge({ autoRetryAttempted: true })).toBe(false);

    process.env.NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE = "true";
    expect(shouldShowAutoRetryBadge({ autoRetryAttempted: false })).toBe(false);
    expect(shouldShowAutoRetryBadge({ autoRetryAttempted: true })).toBe(true);

    process.env.NEXT_PUBLIC_DERIVATION_AUTO_RETRY_BADGE = original;
  });
});
