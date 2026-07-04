import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GoalPackageReview from "./GoalPackageReview";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const packageItems = [
  { format: "1:1", versionId: "v1", status: "approved" as const, previewUrl: "https://cdn/1.png" },
  { format: "4:5", versionId: "v2", status: "ready" as const, previewUrl: "https://cdn/2.png" },
  { format: "9:16", versionId: null, status: "running" as const, previewUrl: null },
  { format: "16:9", versionId: null, status: "pending" as const, previewUrl: null },
];

describe("GoalPackageReview", () => {
  it("renders four fixed format slots", () => {
    render(
      <GoalPackageReview
        packageItems={packageItems}
        approvedFormatCount={1}
        requiredFormatCount={4}
        onApprove={vi.fn()}
        onAnnotate={vi.fn()}
      />
    );

    expect(screen.getAllByTestId(/^assistant-package-slot-/)).toHaveLength(4);
  });

  it("shows each format as separately approvable", () => {
    const onApprove = vi.fn();
    render(
      <GoalPackageReview
        packageItems={packageItems}
        approvedFormatCount={1}
        requiredFormatCount={4}
        onApprove={onApprove}
        onAnnotate={vi.fn()}
      />
    );

    // 4:5 is ready and not yet approved → approve button enabled.
    fireEvent.click(screen.getByTestId("assistant-package-approve-4:5"));
    expect(onApprove).toHaveBeenCalledWith("v2");
  });

  it("does not provide a single approve-all button", () => {
    render(
      <GoalPackageReview
        packageItems={packageItems}
        approvedFormatCount={1}
        requiredFormatCount={4}
        onApprove={vi.fn()}
        onAnnotate={vi.fn()}
      />
    );

    expect(screen.queryByTestId("assistant-package-approve-all")).not.toBeInTheDocument();
  });

  it("disables approve for a running slot", () => {
    render(
      <GoalPackageReview
        packageItems={packageItems}
        approvedFormatCount={1}
        requiredFormatCount={4}
        onApprove={vi.fn()}
        onAnnotate={vi.fn()}
      />
    );

    expect(screen.getByTestId("assistant-package-approve-9:16")).toBeDisabled();
  });

  it("shows approval progress out of four", () => {
    render(
      <GoalPackageReview
        packageItems={packageItems}
        approvedFormatCount={1}
        requiredFormatCount={4}
        onApprove={vi.fn()}
        onAnnotate={vi.fn()}
      />
    );

    expect(screen.getByTestId("assistant-package-progress")).toHaveTextContent("1/4");
  });
});
