import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AssistantMessageList from "./AssistantMessageList";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("./markdown-lite", () => ({
  renderMarkdownLite: (value: string) => value,
}));

vi.mock("./AssistantEmptyState", () => ({
  default: () => <div data-testid="assistant-thread-empty-state" />,
}));

const mockConfirmMutate = vi.fn();
const mockCancelMutate = vi.fn();

vi.mock("@/lib/hooks/use-assistant-actions", () => ({
  useConfirmAssistantAction: () => ({ mutate: mockConfirmMutate, isPending: false }),
  useCancelAssistantAction: () => ({ mutate: mockCancelMutate, isPending: false }),
}));

describe("AssistantMessageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders messages inside the parent scroll region", () => {
    render(
      <AssistantMessageList
        messages={[]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.getByTestId("assistant-message-list")).not.toHaveClass("overflow-y-auto");
  });

  it("does not render get_thread_context tool JSON in the transcript", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            id: "tool-1",
            type: "tool",
            content: '{"thread":{"name":"Main"}}',
            payload: {
              toolName: "get_thread_context",
              summary: '{"thread":{"name":"Main"}}',
            },
          },
        ]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.queryByTestId("assistant-tool-message")).not.toBeInTheDocument();
    expect(screen.queryByText(/"thread"/)).not.toBeInTheDocument();
  });

  it("renders safe tool summaries for non-context tools", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            id: "tool-2",
            type: "tool",
            content: "Ação proposta",
            payload: {
              toolName: "propose_action",
              summary: "Ação proposta",
            },
          },
        ]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.getByTestId("assistant-tool-message")).toHaveTextContent(
      "propose_action: Ação proposta"
    );
  });

  const quickRestyleActionCard = {
    id: "action-quick-1",
    type: "action_card" as const,
    content: "Restyle rápido",
    payload: {
      actionRecordId: "action-quick-1",
      status: "pending",
      inputSnapshot: {
        baseCreativeId: "550e8400-e29b-41d4-a716-446655440000",
        styleReferenceId: "550e8400-e29b-41d4-a716-446655440001",
      },
      display: {
        label: "Restyle rápido",
        actionType: "quick_restyle",
        intentFamily: "quick_action",
        riskLabel: "medium",
        creditImpact: { kind: "creditAction", action: "restyling", label: "5 créditos" },
        riskCopyLines: ["Sem referência de estilo, o resultado pode divergir."],
        confirmationPolicy: "required",
      },
    },
  };

  it("does not render historical frozen persona action cards", () => {
    render(
      <AssistantMessageList
        messages={[
          {
            ...quickRestyleActionCard,
            id: "action-persona-1",
            payload: {
              ...quickRestyleActionCard.payload,
              actionRecordId: "action-persona-1",
              display: {
                ...quickRestyleActionCard.payload.display,
                label: "Simular personas",
                actionType: "quick_persona_simulate",
              },
            },
          },
        ]}
        streamingText=""
        isStreaming={false}
        threadId="thread-1"
      />
    );

    expect(screen.queryByText("Simular personas")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("assistant-action-card-propose")
    ).not.toBeInTheDocument();
  });

  describe("quick_action proposals render the new ActionCard", () => {
    // The new ActionCard exposes data-action-type (from the contract) while the
    // legacy AssistantActionCard exposes data-testid="assistant-action-card".
    function newCard() {
      return screen.getByTestId("assistant-action-card-propose");
    }

    it("renders the contract label as the card title", () => {
      render(
        <AssistantMessageList
          messages={[quickRestyleActionCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      expect(within(newCard()).getByText("Restyle rápido")).toBeInTheDocument();
    });

    it("renders Confirm and Cancel buttons inside the new card", () => {
      render(
        <AssistantMessageList
          messages={[quickRestyleActionCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      const card = newCard();
      const inner = within(card).getByText("Restyle rápido").closest(
        "[data-action-type]"
      ) as HTMLElement;
      expect(inner).toHaveAttribute("data-action-type", "quick_restyle");
      expect(inner).toHaveAttribute("data-action-status", "pending");
      expect(
        within(card).getByRole("button", { name: /confirmar|confirm/i })
      ).toBeInTheDocument();
      expect(
        within(card).getByRole("button", { name: /cancelar|cancel/i })
      ).toBeInTheDocument();
    });

    it("calls the confirm endpoint mutation on Confirm click", () => {
      render(
        <AssistantMessageList
          messages={[quickRestyleActionCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      fireEvent.click(
        within(newCard()).getByRole("button", { name: /confirmar|confirm/i })
      );

      expect(mockConfirmMutate).toHaveBeenCalledWith({
        actionId: "action-quick-1",
        threadId: "thread-1",
      });
    });

    it("calls the cancel endpoint mutation on Cancel click", () => {
      render(
        <AssistantMessageList
          messages={[quickRestyleActionCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      fireEvent.click(
        within(newCard()).getByRole("button", { name: /cancelar|cancel/i })
      );

      expect(mockCancelMutate).toHaveBeenCalledWith({
        actionId: "action-quick-1",
        threadId: "thread-1",
      });
    });

    it("still renders risk copy lines from the snapshot", () => {
      render(
        <AssistantMessageList
          messages={[quickRestyleActionCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      expect(within(newCard()).getByText(/divergir/i)).toBeInTheDocument();
    });

    it("hides action buttons for terminal (completed) quick actions", () => {
      render(
        <AssistantMessageList
          messages={[
            { ...quickRestyleActionCard, payload: { ...quickRestyleActionCard.payload, status: "completed" } },
          ]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      const card = newCard();
      const inner = within(card).getByText("Restyle rápido").closest(
        "[data-action-type]"
      ) as HTMLElement;
      expect(inner).toHaveAttribute("data-action-status", "completed");
      expect(
        within(card).queryByRole("button", { name: /confirmar|confirm/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("complete_campaign proposals keep the legacy AssistantActionCard", () => {
    it("renders the legacy card for revise_creative_plan (not the new ActionCard)", () => {
      render(
        <AssistantMessageList
          messages={[
            {
              id: "action-plan-1",
              type: "action_card" as const,
              content: "Revisão do plano",
              payload: {
                actionRecordId: "action-plan-1",
                status: "pending",
                display: {
                  label: "Revisão do plano",
                  actionType: "revise_creative_plan",
                  intentFamily: "complete_campaign",
                  riskLabel: "medium",
                  riskCopyLines: [],
                  confirmationPolicy: "required",
                },
              },
            },
          ]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      // Legacy card carries its own test id; the new ActionCard uses the propose test id.
      expect(screen.getByTestId("assistant-action-card")).toBeInTheDocument();
      expect(
        screen.queryByTestId("assistant-action-card-propose")
      ).not.toBeInTheDocument();
    });
  });
});
