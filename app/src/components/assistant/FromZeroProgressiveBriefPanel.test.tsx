import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FromZeroProgressiveBriefPanel from "./FromZeroProgressiveBriefPanel";
import type { GuidedFlow } from "@/lib/hooks/use-guided-flow";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";

const mockMutateAsync = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/lib/hooks/use-guided-flow-commands", () => ({
  useGuidedFlowCommand: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const guidedFlow: GuidedFlow = {
  id: "flow-1",
  workspaceId: "ws-1",
  clientProfileId: "cp-1",
  threadId: "thread-1",
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  slots: {},
  missingFields: ["product"],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const presentation: GuidedFlowPresentation = {
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  revision: 1,
  schemaVersion: 2,
  missingFields: ["product"],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  recoverableError: null,
  slots: {},
  navigationHistory: ["collect_brief"],
  allowedCommands: ["answer_brief"],
  prompt: {
    field: "product",
    labelKey: "product",
    quickReplies: ["Tênis"],
    allowUnknown: true,
  },
};

function renderPanel(step: GuidedFlow["currentStep"] = "collect_brief") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FromZeroProgressiveBriefPanel
        threadId="thread-1"
        guidedFlow={{ ...guidedFlow, currentStep: step }}
        presentation={{
          ...presentation,
          currentStep: step,
          ...(step === "review_brief"
            ? { briefReview: { product: "Tênis" } }
            : {}),
        }}
      />
    </QueryClientProvider>
  );
}

describe("FromZeroProgressiveBriefPanel accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({ presentation });
  });

  it("labels the progressive answer input for screen readers", () => {
    renderPanel();
    expect(screen.getByTestId("from-zero-progressive-brief-panel")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("submits answer via keyboard on the progressive step", async () => {
    renderPanel();
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "Tênis esportivo" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({
            type: "answer_brief",
            value: "Tênis esportivo",
          }),
        })
      );
    });
  });

  it("shows brief review panel with confirm control at review step", () => {
    renderPanel("review_brief");
    expect(screen.getByTestId("from-zero-brief-review-panel")).toBeInTheDocument();
    expect(screen.getByTestId("from-zero-confirm-brief-review")).toBeInTheDocument();
  });

  it("surfaces validation errors with accessible messaging", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Campo obrigatório"));
    renderPanel();

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Tênis" },
    });
    fireEvent.click(screen.getByTestId("from-zero-submit-answer"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Campo obrigatório");
    });
  });
});
