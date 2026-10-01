// Ticket 08: the open conversation keeps asking for the thread after "É isso" until the
// diagnosis card (built in the background) reaches it — real thread hook, scripted API.

import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AssistantChatCore from "./AssistantChatCore";
import { AssistantSurfaceProvider } from "./AssistantSurfaceContext";

const mockUseAssistantChat = vi.fn();
const mockApiFetch = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "pt-BR",
}));
vi.mock("@/lib/api-client", () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
vi.mock("@/lib/hooks/use-assistant-chat", () => ({ useAssistantChat: (...args: unknown[]) => mockUseAssistantChat(...args) }));
vi.mock("@/lib/hooks/use-plan-feedback-draft", () => ({
  usePlanFeedbackDraft: () => ({ draftText: "", onDraftTextChange: vi.fn(), clearDraft: vi.fn(), isLoading: false }),
}));
vi.mock("@/lib/equipe/use-equipe", () => ({ useEquipeAccountState: () => ({ data: undefined, isLoading: false }) }));

const thread = { id: "thread-1", workspaceId: "ws-1", clientProfileId: "p-1", campaignId: null, name: "Cliente", isDefault: false, migratedFromThreadId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
const at = () => new Date().toISOString();
const message = (id: string, sequence: number, type: string, content: string, payload: Record<string, unknown>) => ({ id, threadId: "thread-1", type, content, payload, sequence, createdAt: at() });
const confirmedMessage = message("m1", 1, "assistant", "Marca confirmada.", { handoffStep: "done" });
const diagnosisCard = message("m2", 2, "equipe_card", "Diagnóstico da marca · 1 oportunidade", {
  kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca", items: [], documentId: "doc-1", brand: "Café Aurora",
  summary: "Torrefação em Campinas.", channels: [], opportunities: [{ title: "Mostrar a origem", sources: ["site"] }], notFound: [], suggestions: [],
});
const respond = (messages: unknown[]) => ({ ok: true, json: () => Promise.resolve({ thread, messages }) }) as unknown as Response;
const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });

function renderCore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AssistantSurfaceProvider><AssistantChatCore threadId="thread-1" variant="full" /></AssistantSurfaceProvider>
    </QueryClientProvider>,
  );
}

describe("AssistantChatCore — the diagnosis arrives while the conversation is open", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "Date"] });
    vi.clearAllMocks();
    mockUseAssistantChat.mockReturnValue({ messages: [], streamingText: "", isStreaming: false, error: null, sendMessage: vi.fn() });
  });
  afterEach(() => { vi.useRealTimers(); });

  it("asks for the thread again every 3 seconds after the confirmation and shows the card when it arrives", async () => {
    mockApiFetch.mockResolvedValueOnce(respond([confirmedMessage])).mockResolvedValueOnce(respond([confirmedMessage])).mockResolvedValue(respond([confirmedMessage, diagnosisCard]));
    renderCore();
    await advance(0);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("equipe-diagnosis")).not.toBeInTheDocument();

    await advance(3_000);
    expect(mockApiFetch).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("equipe-diagnosis")).not.toBeInTheDocument();

    await advance(3_000);
    await advance(50);
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("equipe-diagnosis")).toBeInTheDocument();
    expect(screen.getByText("Torrefação em Campinas.")).toBeInTheDocument();

    // with the card in the thread the polling is over
    await advance(30_000);
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it("an ordinary conversation is not polled", async () => {
    mockApiFetch.mockResolvedValue(respond([message("m1", 1, "user", "Oi", {})]));
    renderCore();
    await advance(0);
    await advance(30_000);
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
