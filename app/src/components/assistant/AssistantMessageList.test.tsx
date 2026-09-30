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

vi.mock("./EquipePlanOffer", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="equipe-plan-offer">{JSON.stringify(props)}</div>
  ),
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

  describe("equipe messages (#551)", () => {
    const batchCard = {
      id: "equipe-card-1",
      type: "equipe_card" as const,
      content: "Lote pronto",
      payload: {
        kind: "batch",
        accountId: "account-1",
        title: "Calendário 23–27/11",
        batchId: "batch-1",
        approveByAt: "2026-11-19T17:00:00.000Z",
        items: [
          { itemId: "item-1", versionHash: "hash-1", title: "Origem: Sul de Minas" },
          { itemId: "item-2", versionHash: "hash-2", title: "Receita: coado gelado" },
        ],
        excluded: [{ itemId: "item-3", reason: "pede confirmação" }],
      },
    };

    it("renders the card with Revisar links and no approve flow when disabled", () => {
      render(
        <AssistantMessageList
          messages={[batchCard]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      expect(screen.getByTestId("equipe-card")).toHaveTextContent("Calendário 23–27/11");
      const reviews = screen.getAllByTestId("equipe-card-review");
      expect(reviews).toHaveLength(2);
      expect(reviews[0]).toHaveAttribute("href", "/pipeline?account=account-1&item=item-1");
      expect(reviews[1]).toHaveAttribute("href", "/pipeline?account=account-1&item=item-2");
      expect(screen.queryByTestId("equipe-card-approve")).not.toBeInTheDocument();
    });

    it("confirms the closed list and calls the Equipe commands endpoint", async () => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      try {
        render(
          <AssistantMessageList
            messages={[batchCard]}
            streamingText=""
            isStreaming={false}
            threadId="thread-1"
            equipeEnabled
          />
        );

        fireEvent.click(screen.getByTestId("equipe-card-approve"));

        const confirm = screen.getByTestId("equipe-card-confirm");
        expect(within(confirm).getAllByTestId("equipe-card-confirm-item")).toHaveLength(2);
        expect(confirm).toHaveTextContent("pede confirmação");

        fireEvent.click(screen.getByTestId("equipe-card-confirm-button"));

        expect(await screen.findByTestId("equipe-card-approved")).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/equipe/accounts/account-1/commands",
          expect.objectContaining({
            method: "POST",
            body: JSON.stringify({
              type: "approve_batch",
              payload: {
                items: [
                  { itemId: "item-1", versionHash: "hash-1" },
                  { itemId: "item-2", versionHash: "hash-2" },
                ],
              },
            }),
          })
        );
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("shows an error when the approval call fails", async () => {
      const fetchMock = vi.fn(
        async () => new Response(JSON.stringify({ error: "stale_version" }), { status: 409 })
      );
      vi.stubGlobal("fetch", fetchMock);
      try {
        render(
          <AssistantMessageList
            messages={[batchCard]}
            streamingText=""
            isStreaming={false}
            threadId="thread-1"
            equipeEnabled
          />
        );

        fireEvent.click(screen.getByTestId("equipe-card-approve"));
        fireEvent.click(screen.getByTestId("equipe-card-confirm-button"));

        expect(await screen.findByRole("alert")).toBeInTheDocument();
        expect(screen.queryByTestId("equipe-card-approved")).not.toBeInTheDocument();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("renders equipe_event lines and staff messages", () => {
      render(
        <AssistantMessageList
          messages={[
            {
              id: "equipe-event-1",
              type: "equipe_event" as const,
              content: "Redação IA criou a v2",
              payload: { kind: "version_created", text: "Redação IA criou a v2" },
            },
            {
              id: "staff-1",
              type: "staff_message" as const,
              content: "Oi, sou a Bruna",
              payload: {
                staffId: "staff-1",
                name: "Bruna Lima",
                photoUrl: "https://cdn.example/bruna.png",
              },
            },
          ]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      expect(screen.getByTestId("equipe-event")).toHaveTextContent("Redação IA criou a v2");
      const staff = screen.getByTestId("staff-message");
      expect(staff).toHaveTextContent("Bruna Lima");
      expect(staff).toHaveTextContent("Oi, sou a Bruna");
      expect(staff.querySelector("img")).toHaveAttribute("src", "https://cdn.example/bruna.png");
    });

    it("renders plan_offer cards with EquipePlanOffer, never EquipeCard (ticket 02)", () => {
      render(
        <AssistantMessageList
          messages={[
            {
              id: "plan-1",
              type: "equipe_card" as const,
              content: "Continue com a equipe",
              payload: {
                kind: "plan_offer",
                accountId: "account-1",
                title: "Continue com a equipe",
                items: [],
              },
            },
          ]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      // EquipePlanOffer owns its own copy (assistant.equipe.plan.*); it takes
      // only accountId/threadId/disabled/onSuggestion, never the card title.
      expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent('"accountId":"account-1"');
      expect(screen.queryByTestId("equipe-card")).not.toBeInTheDocument();
    });

    it("localizes the persisted handoff completion notice", () => {
      render(<AssistantMessageList messages={[{ id: "handoff-done", type: "assistant", content: "Sua marca está confirmada.", payload: { handoffStep: "done" } }]} streamingText="" isStreaming={false} threadId="thread-1" />);
      expect(screen.getByText("doneText")).toBeInTheDocument();
      expect(screen.queryByText("Sua marca está confirmada.")).not.toBeInTheDocument();
    });

    it("falls back to a plain bubble for malformed card payloads", () => {
      render(
        <AssistantMessageList
          messages={[
            {
              id: "equipe-card-bad",
              type: "equipe_card" as const,
              content: "conteúdo original",
              payload: { kind: "batch" },
            },
          ]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
        />
      );

      expect(screen.queryByTestId("equipe-card")).not.toBeInTheDocument();
      expect(screen.getByTestId("assistant-message-equipe_card")).toHaveTextContent(
        "conteúdo original"
      );
    });
  });

  describe("suggestions / iscas (ticket 02)", () => {
    const assistantWithSuggestions = {
      id: "assistant-1",
      type: "assistant" as const,
      content: "Aqui está o resumo da sua marca.",
      payload: { suggestions: ["Me explica a oportunidade 2", "Quero ver mais exemplos"] },
    };

    it("renders one clickable suggestion per item, calling onSuggestion with its text", () => {
      const onSuggestion = vi.fn();
      render(
        <AssistantMessageList
          messages={[assistantWithSuggestions]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
          onSuggestion={onSuggestion}
        />
      );

      const container = screen.getByTestId("assistant-suggestions");
      const firstChip = within(container).getByRole("button", { name: "Me explica a oportunidade 2" });
      expect(within(container).getByRole("button", { name: "Quero ver mais exemplos" })).toBeInTheDocument();

      fireEvent.click(firstChip);
      expect(onSuggestion).toHaveBeenCalledWith("Me explica a oportunidade 2");
    });

    it("renders no suggestion chips when payload.suggestions is absent or empty", () => {
      render(
        <AssistantMessageList
          messages={[{ id: "a2", type: "assistant" as const, content: "Tudo certo.", payload: {} }]}
          streamingText=""
          isStreaming={false}
          threadId="thread-1"
          onSuggestion={vi.fn()}
        />
      );

      expect(screen.queryByTestId("assistant-suggestions")).not.toBeInTheDocument();
    });
  });
});
