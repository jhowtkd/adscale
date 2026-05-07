import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BriefingStep from "@/components/workspace/BriefingStep";

const mockMutate = vi.fn();
const mockUseMutation = vi.fn();

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
    form: ({ children, ...props }: React.HTMLAttributes<HTMLFormElement>) => <form {...props}>{children}</form>,
    p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p {...props}>{children}</p>,
  },
}));

vi.mock("@/lib/hooks/use-briefing-doctor", () => ({
  useBriefingDoctorAnalysis: () => mockUseMutation(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function renderBriefingStep(props = {}) {
  return render(
    <BriefingStep
      campaign={null}
      onContinue={vi.fn()}
      onSaveDraft={vi.fn()}
      {...props}
    />
  );
}

describe("BriefingDoctor UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      data: undefined,
      isPending: false,
      isError: false,
    });
  });

  it("renders local issues without calling AI", () => {
    renderBriefingStep();
    expect(screen.getByText("doctor.title")).toBeInTheDocument();
    expect(screen.getAllByText(/missing/i).length).toBeGreaterThanOrEqual(1);
  });

  it("clicking analyze button calls the mutation", () => {
    renderBriefingStep();
    const button = screen.getByRole("button", { name: /doctor.analyze/i });
    fireEvent.click(button);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it("applying a suggestion patch updates the corresponding field", () => {
    mockUseMutation.mockReturnValue({
      mutate: mockMutate,
      data: {
        overallScore: 82,
        readiness: "needs_attention",
        issues: [],
        suggestions: [
          {
            field: "constraints",
            title: "Improve constraints",
            suggestedValue: "Keep text under 15% of image",
            rationale: "Better legibility in generated ads.",
          },
        ],
        improvedBrief: {},
        fieldPatches: [
          {
            field: "constraints",
            value: "Keep text under 15% of image",
          },
        ],
      },
      isPending: false,
      isError: false,
    });

    renderBriefingStep();
    const applyButton = screen.getByRole("button", { name: /doctor.apply/i });
    fireEvent.click(applyButton);

    const constraintsTextarea = screen.getByPlaceholderText("constraintsPlaceholder") as HTMLTextAreaElement;
    expect(constraintsTextarea).toHaveValue("Keep text under 15% of image");
  });

  it("continue remains clickable when local warnings exist", () => {
    renderBriefingStep();
    const continueButton = screen.getByRole("button", { name: /saveContinue/i });
    expect(continueButton).not.toBeDisabled();
  });
});
