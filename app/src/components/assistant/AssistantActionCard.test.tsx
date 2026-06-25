import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantActionCard from "./AssistantActionCard";

const mockConfirmMutate = vi.fn();
const mockCancelMutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-assistant-actions", () => ({
  useConfirmAssistantAction: () => ({
    mutate: mockConfirmMutate,
    isPending: false,
  }),
  useCancelAssistantAction: () => ({
    mutate: mockCancelMutate,
    isPending: false,
  }),
}));

describe("AssistantActionCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const basePayload = {
    actionRecordId: "action-1",
    status: "pending",
    display: {
      label: "Quick restyle",
      actionType: "quick_restyle",
      riskLabel: "medium",
      creditImpact: { kind: "fixed", credits: 5, label: "5 credits" },
      riskCopyLines: ["Will modify creative"],
      confirmationPolicy: "required",
    },
  };

  it("shows confirm and cancel for pending cards", () => {
    render(<AssistantActionCard threadId="thread-1" payload={basePayload} />);

    expect(screen.getByText("Quick restyle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "cancel" })).toBeInTheDocument();
  });

  it("calls confirm mutation with actionRecordId", () => {
    render(<AssistantActionCard threadId="thread-1" payload={basePayload} />);

    fireEvent.click(screen.getByRole("button", { name: "confirm" }));
    expect(mockConfirmMutate).toHaveBeenCalledWith({
      actionId: "action-1",
      threadId: "thread-1",
    });
  });

  it("hides confirm button for terminal statuses", () => {
    render(
      <AssistantActionCard
        threadId="thread-1"
        payload={{ ...basePayload, status: "completed" }}
      />
    );

    expect(
      screen.queryByRole("button", { name: "confirm" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("status.completed")).toBeInTheDocument();
  });
});
