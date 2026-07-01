import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { DerivationAutoRetryBadge } from "./DerivationAutoRetryBadge";
import * as derivationReviewDisplay from "@/lib/derivation-display";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { codes?: string }) => {
    if (key === "autoRetryBadgeHint" && values?.codes) {
      return `hint:${values.codes}`;
    }
    return key;
  },
}));

describe("DerivationAutoRetryBadge", () => {
  beforeEach(() => {
    vi.spyOn(derivationReviewDisplay, "shouldShowAutoRetryBadge");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when badge is gated off", () => {
    vi.mocked(derivationReviewDisplay.shouldShowAutoRetryBadge).mockReturnValue(false);

    const { container } = render(
      <DerivationAutoRetryBadge derivation={{ autoRetryAttempted: true }} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders badge with reason tooltip when enabled", () => {
    vi.mocked(derivationReviewDisplay.shouldShowAutoRetryBadge).mockReturnValue(true);

    render(
      <DerivationAutoRetryBadge
        derivation={{ autoRetryAttempted: true, autoRetryReason: "cta_drift" }}
      />
    );

    expect(screen.getByText("autoRetryBadge")).toBeInTheDocument();
    expect(screen.getByTitle("hint:cta_drift")).toBeInTheDocument();
  });
});
