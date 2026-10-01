// Ticket 08: every plan card of the conversation waits while the account says the plan is not available.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssistantMessageList from "./AssistantMessageList";
import ptBR from "../../../messages/pt-BR.json";

vi.mock("./markdown-lite", () => ({ renderMarkdownLite: (value: string) => value }));
vi.mock("./AssistantEmptyState", () => ({ default: () => <div data-testid="assistant-thread-empty-state" /> }));
vi.mock("@/lib/hooks/use-assistant-actions", () => ({
  useConfirmAssistantAction: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelAssistantAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/lib/equipe/commands", () => ({ requestEquipeSupport: vi.fn() }));
const mockAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: (...args: unknown[]) => mockAccountState(...args) }));

const copy = ptBR.assistant.equipe.plan;
const plan = (id: string) => ({ id, type: "equipe_card" as const, content: "Continue com a equipe", payload: { kind: "plan_offer", accountId: "account-1", title: "Continue com a equipe", items: [] } });

function renderList(messages: unknown[], variant: "classic" | "rail" = "classic") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <QueryClientProvider client={client}>
        <AssistantMessageList messages={messages as never} streamingText="" isStreaming={false} threadId="thread-1" equipeEnabled onSuggestion={vi.fn()} variant={variant} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe("AssistantMessageList: plan cards while the diagnosis is being replaced", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("an old plan card and a recent one are BOTH on hold when the account says planAvailable:false", () => {
    mockAccountState.mockReturnValue({ data: { planAvailable: false }, isLoading: false, error: null });
    renderList([plan("plan-old"), { id: "u1", type: "user", content: "Corrigir ou acrescentar meu site ou @", payload: {} }, plan("plan-new")]);
    const cards = screen.getAllByTestId("equipe-plan-offer");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(within(card).getByRole("button", { name: copy.subscribe })).toBeDisabled();
      expect(within(card).getByRole("status")).toHaveTextContent(copy.waiting);
    }
  });

  it("both are enabled once the plan is available (and with an older server that omits the field)", () => {
    for (const data of [{ planAvailable: true }, {}]) {
      mockAccountState.mockReturnValue({ data, isLoading: false, error: null });
      const view = renderList([plan("plan-old"), plan("plan-new")]);
      for (const card of screen.getAllByTestId("equipe-plan-offer")) {
        expect(within(card).getByRole("button", { name: copy.subscribe })).toBeEnabled();
        expect(within(card).getByRole("status")).toHaveTextContent(copy.contact);
      }
      view.unmount();
    }
  });

  it("each card asks for the state of ITS account", () => {
    mockAccountState.mockReturnValue({ data: { planAvailable: true }, isLoading: false, error: null });
    renderList([plan("plan-1")]);
    expect(mockAccountState).toHaveBeenCalledWith("account-1");
  });
});

// Ticket 13, D-12: the card offered because the credit ended before the diagnosis carries its reason, and the intro must not claim a diagnosis exists.
describe("AssistantMessageList: the plan card offered because the credit ended before the diagnosis", () => {
  beforeEach(() => { vi.clearAllMocks(); mockAccountState.mockReturnValue({ data: { planAvailable: true }, isLoading: false, error: null }); });
  const withReason = (reason?: string) => ({ ...plan("plan-reason"), payload: { ...plan("plan-reason").payload, ...(reason ? { reason } : {}) } });

  it.each(["classic", "rail"] as const)("%s conversation: the stored reason reaches the card", (variant) => {
    renderList([withReason("diagnosis_budget_exceeded")], variant);
    expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent(copy.introBudget);
    expect(screen.getByTestId("equipe-plan-offer")).not.toHaveTextContent(copy.intro);
  });

  it.each(["classic", "rail"] as const)("%s conversation: any other reason, or none, keeps the usual intro", (variant) => {
    for (const reason of [undefined, "free_budget_exhausted"]) {
      const view = renderList([withReason(reason)], variant);
      expect(screen.getByTestId("equipe-plan-offer")).toHaveTextContent(copy.intro);
      expect(screen.getByTestId("equipe-plan-offer")).not.toHaveTextContent(copy.introBudget);
      view.unmount();
    }
  });
});
