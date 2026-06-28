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

  it("renders summary-only plan revision card without credit copy", () => {
    render(
      <AssistantActionCard
        threadId="thread-1"
        payload={{
          actionRecordId: "action-2",
          status: "pending",
          display: {
            label: "Confirmar revisão do plano",
            actionType: "revise_creative_plan",
            summary: "Revisão do plano com alterações em: ctas.",
            sourceVersionLabel: "v2",
            writes: ["Cria v3 do plano", "Não altera a versão aprovada atual"],
            creditImpact: { kind: "fixed", credits: 0 },
            confirmationPolicy: "required",
          },
        }}
      />
    );

    expect(screen.getByText(/Revisão do plano/)).toBeInTheDocument();
    expect(screen.getByText(/Revisando v2/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Confirmar revisão do plano" })
    ).toBeInTheDocument();
    expect(screen.queryByText("creditImpact")).not.toBeInTheDocument();
  });

  it("passes proposalId when canceling a revise plan card", () => {
    render(
      <AssistantActionCard
        threadId="thread-1"
        payload={{
          actionRecordId: "action-2",
          status: "pending",
          display: {
            label: "Confirmar revisão do plano",
            actionType: "revise_creative_plan",
            proposalId: "proposal-99",
            summary: "Revisão do plano",
          },
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "cancel" }));
    expect(mockCancelMutate).toHaveBeenCalledWith({
      actionId: "action-2",
      threadId: "thread-1",
      proposalId: "proposal-99",
    });
  });

  describe("creative revision (revise_creative)", () => {
    const creativePayload = {
      actionRecordId: "creative-action-1",
      status: "pending",
      display: {
        label: "Confirmar revisão do criativo",
        actionType: "revise_creative",
        summary: "Ajustar cor de fundo para tons mais quentes",
        intendedChanges: ["Mudar cor de fundo", "Ajustar contraste do texto"],
        format: "1:1",
        referenceCount: 3,
        planVersionLabel: "v2",
        writes: ["Gera nova versão do criativo", "Cobra 5 créditos"],
        creditImpact: { kind: "creditAction", action: "image_derivation", label: "5 créditos" },
        riskLabel: "medium",
        confirmationPolicy: "required",
        proposalId: "creative-proposal-1",
      },
    };

    it("renders summary, intendedChanges, format, referenceCount, planVersionLabel, writes", () => {
      render(<AssistantActionCard threadId="thread-1" payload={creativePayload} />);

      expect(screen.getByText(/Ajustar cor de fundo/)).toBeInTheDocument();
      expect(screen.getByText("Mudar cor de fundo")).toBeInTheDocument();
      expect(screen.getByText("Ajustar contraste do texto")).toBeInTheDocument();
      expect(screen.getByText("1:1")).toBeInTheDocument();
      expect(screen.getByText("3 referências")).toBeInTheDocument();
      expect(screen.getByText(/Plano: v2/)).toBeInTheDocument();
      expect(screen.getByText("5 créditos")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Confirmar revisão do criativo" })
      ).toBeInTheDocument();
    });

    it("renders reference items with thumbnails when provided", () => {
      const payloadWithItems = {
        ...creativePayload,
        display: {
          ...creativePayload.display,
          referenceItems: [
            { id: "ref-1", name: "Hero shot", thumbnailUrl: "https://example.com/hero.jpg" },
            { id: "ref-2", name: "Logo dark", thumbnailUrl: null },
          ],
        },
      };

      render(<AssistantActionCard threadId="thread-1" payload={payloadWithItems} />);

      expect(screen.getByText("Hero shot")).toBeInTheDocument();
      expect(screen.getByText("Logo dark")).toBeInTheDocument();
      expect(screen.getByAltText("Hero shot")).toBeInTheDocument();
    });

    it("opens CreditConfirmModal on confirm click instead of mutating directly", () => {
      render(<AssistantActionCard threadId="thread-1" payload={creativePayload} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Confirmar revisão do criativo" })
      );

      expect(screen.getByTestId("credit-confirm-modal")).toBeInTheDocument();
      expect(mockConfirmMutate).not.toHaveBeenCalled();
    });

    it("calls confirm mutation when modal Confirmar button is clicked", () => {
      render(<AssistantActionCard threadId="thread-1" payload={creativePayload} />);

      fireEvent.click(
        screen.getByRole("button", { name: "Confirmar revisão do criativo" })
      );
      fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

      expect(mockConfirmMutate).toHaveBeenCalledWith({
        actionId: "creative-action-1",
        threadId: "thread-1",
      });
    });

    it("cancels creative proposal with proposalId cascade", () => {
      render(<AssistantActionCard threadId="thread-1" payload={creativePayload} />);

      fireEvent.click(screen.getByRole("button", { name: "cancel" }));
      expect(mockCancelMutate).toHaveBeenCalledWith({
        actionId: "creative-action-1",
        threadId: "thread-1",
        proposalId: "creative-proposal-1",
      });
    });

    it("shows retry button on failed creative revision", () => {
      render(
        <AssistantActionCard
          threadId="thread-1"
          payload={{ ...creativePayload, status: "failed" }}
        />
      );

      const retryBtn = screen.getByRole("button", { name: "Tentar novamente" });
      fireEvent.click(retryBtn);
      expect(mockConfirmMutate).toHaveBeenCalledWith({
        actionId: "creative-action-1",
        threadId: "thread-1",
      });
    });
  });
});
