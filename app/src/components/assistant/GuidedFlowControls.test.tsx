import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GuidedFlowControls from "./GuidedFlowControls";
import type { GuidedFlowPresentation } from "@/lib/guided-flow/commands";

const mockMutateAsync = vi.fn();

vi.mock("@/lib/hooks/use-guided-flow-commands", () => ({
  useGuidedFlowCommand: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

const presentation: GuidedFlowPresentation = {
  path: "from_zero",
  status: "active",
  currentStep: "collect_brief",
  revision: 2,
  schemaVersion: 2,
  missingFields: [],
  assetIds: [],
  referenceIds: [],
  campaignId: null,
  recoverableError: null,
  slots: {},
  navigationHistory: ["collect_brief"],
  allowedCommands: ["back", "clear_error", "preview_restart", "preview_switch"],
};

function renderControls(override?: Partial<GuidedFlowPresentation>) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GuidedFlowControls
        threadId="thread-1"
        presentation={{ ...presentation, ...override }}
      />
    </QueryClientProvider>
  );
}

describe("GuidedFlowControls accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue({
      presentation: {
        ...presentation,
        retentionPreview: { retained: ["answers"], cleared: ["referenceIds"] },
      },
    });
  });

  it("exposes focusable navigation controls", async () => {
    renderControls();

    const backButton = screen.getByRole("button", { name: /Voltar/i });
    backButton.focus();
    expect(backButton).toHaveFocus();
    fireEvent.click(backButton);
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          command: { type: "back" },
        })
      );
    });
  });

  it("shows retention preview with role=status after restart preview", async () => {
    renderControls();
    fireEvent.click(screen.getByRole("button", { name: /Reiniciar/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveTextContent("Será mantido");
  });

  it("surfaces command errors with role=alert", async () => {
    mockMutateAsync.mockRejectedValue(new Error("Outra aba atualizou a jornada."));
    renderControls();

    fireEvent.click(screen.getByRole("button", { name: /Voltar/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Outra aba atualizou a jornada."
      );
    });
  });

  it("offers retry when clear_error is allowed", () => {
    renderControls();
    expect(screen.getByRole("button", { name: /Tentar novamente/i })).toBeInTheDocument();
  });
});
