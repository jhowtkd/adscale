"use client";

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AssistantReviewPanel from "./AssistantReviewPanel";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    if (key === "ready" && values?.format) {
      return `Ready ${values.format}`;
    }
    const labels: Record<string, string> = {
      title: "Review",
      openReview: "Open review",
      noDerivation: "No derivation",
    };
    return labels[key] ?? key;
  },
}));

vi.mock("@/lib/hooks/use-assistant-threads", () => ({
  useAssistantThread: () => ({
    data: {
      thread: {
        id: "thread-1",
        campaignId: "campaign-1",
        clientProfileId: "client-1",
      },
      messages: [],
    },
  }),
}));

vi.mock("@/lib/hooks/use-derivations", () => ({
  useDerivations: () => ({
    data: [
      {
        id: "derivation-1",
        campaignId: "campaign-1",
        workspaceId: "ws-1",
        status: "completed",
        format: "1:1",
        imageUrl: "https://example.com/image.png",
      },
    ],
  }),
}));

vi.mock("@/lib/hooks/use-review", () => ({
  useReviewDerivation: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
}));

vi.mock("@/components/workspace/DerivationReviewSheet", () => ({
  default: () => <div data-testid="derivation-review-sheet" />,
}));

describe("AssistantReviewPanel", () => {
  it("renders review section with workspace sheet component", () => {
    render(<AssistantReviewPanel threadId="thread-1" />);
    expect(screen.getByTestId("assistant-review-panel")).toBeInTheDocument();
    expect(screen.getByText("Open review")).toBeInTheDocument();
  });
});
