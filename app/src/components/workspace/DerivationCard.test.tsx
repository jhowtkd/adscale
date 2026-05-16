import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DerivationCard from "./DerivationCard";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-export", () => ({
  useExport: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => ({
    addToast: vi.fn(),
  }),
}));

const baseDerivation = {
  id: "derivation-1",
  campaignId: "campaign-1",
  name: "Test Derivation",
  status: "approved" as const,
  platform: "Meta" as const,
  prompt: "Test prompt",
  creditCost: 2.4,
  imageUrl: "/test.png",
  format: "1:1",
  createdAt: new Date(),
};

describe("DerivationCard", () => {
  it("shows package action only for approved derivations with output", () => {
    render(
      <DerivationCard
        derivation={baseDerivation}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.getByRole("button", { name: /generatePackage/i })
    ).toBeInTheDocument();
  });

  it("does not show package action for completed but not approved derivations", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, status: "completed" }}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generatePackage/i })
    ).not.toBeInTheDocument();
  });

  it("does not show package action when imageUrl is missing", () => {
    render(
      <DerivationCard
        derivation={{ ...baseDerivation, imageUrl: undefined }}
        index={0}
        onPreview={vi.fn()}
        onCreateDeliveryPackage={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: /generatePackage/i })
    ).not.toBeInTheDocument();
  });
});
