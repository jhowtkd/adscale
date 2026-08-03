import { describe, expect, it } from "vitest";
import { shouldShowAutoRetryBadge, verdictBadgeClassName } from "./derivation-display";

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

describe("verdictBadgeClassName", () => {
  it("maps verdict tones to semantic status tokens", () => {
    expect(verdictBadgeClassName("ready")).toBe(
      "border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success-text)]",
    );
    expect(verdictBadgeClassName("quase")).toBe(
      "border-[var(--warning-border)] bg-[var(--warning-bg)] text-[var(--warning-text)]",
    );
    expect(verdictBadgeClassName("blocked")).toBe(
      "border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger-text)]",
    );
    expect(verdictBadgeClassName("neutral")).toBe(
      "border-[var(--border-dim)] bg-[var(--surface-raised)] text-[var(--text-secondary)]",
    );
  });
});
