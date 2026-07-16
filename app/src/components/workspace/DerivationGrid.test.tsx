import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DerivationGrid from "./DerivationGrid";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));

vi.mock("@/lib/hooks/use-export", () => ({
  useExport: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/store", () => ({
  useAppStore: () => ({ addToast: vi.fn() }),
}));

const derivation = {
  id: "derivation-1",
  campaignId: "campaign-1",
  name: "Piece 1",
  status: "completed" as const,
  platform: "Meta" as const,
  prompt: "",
  creditCost: 2.4,
  imageUrl: "/test.png",
  format: "1:1",
  createdAt: new Date(),
};

describe("DerivationGrid", () => {
  it("opens the review sheet when Reject is clicked instead of rejecting without direction", () => {
    const onPreview = vi.fn();
    const onReject = vi.fn();

    render(
      <DerivationGrid
        derivations={[derivation]}
        onAddNew={vi.fn()}
        onPreview={onPreview}
        onApprove={vi.fn()}
        onReject={onReject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "reject" }));

    expect(onPreview).toHaveBeenCalledWith("derivation-1");
    expect(onReject).not.toHaveBeenCalled();
  });
});
