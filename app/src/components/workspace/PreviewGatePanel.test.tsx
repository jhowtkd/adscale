import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PreviewGatePanel from "./PreviewGatePanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    if (values) {
      return `${key}:${JSON.stringify(values)}`;
    }
    return key;
  },
}));

describe("PreviewGatePanel", () => {
  it("shows batch credit cost and actions", () => {
    const onApprove = vi.fn();
    const onRevise = vi.fn();

    render(
      <PreviewGatePanel
        preview={{
          id: "d1",
          name: "Preview 1",
          imageUrl: "https://example.com/preview.png",
          status: "completed",
          qualityScore: 82,
          qualityVerdict: "pass",
        }}
        previewCreditsSpent={5}
        batchCredits={15}
        onApproveBatch={onApprove}
        onReviseRecipe={onRevise}
      />
    );

    expect(screen.getByText(/batchCost/)).toBeInTheDocument();
    expect(screen.getByText(/previewSpent/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("approveBatch"));
    fireEvent.click(screen.getByText("reviseRecipe"));

    expect(onApprove).toHaveBeenCalled();
    expect(onRevise).toHaveBeenCalled();
  });
});
