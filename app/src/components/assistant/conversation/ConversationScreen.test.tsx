import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

type Context = { isPrimary: boolean | null; topic: string | null };
let context: Context;
const contextHook = vi.fn((id: string | null) => { void id; return context; });
vi.mock("@/lib/equipe/use-conversation-context", () => ({ useConversationContext: (id: string | null) => contextHook(id) }));
vi.mock("./ConversationList", () => ({
  default: ({ threadId, onNavigate }: { threadId: string | null; onNavigate?: () => void }) => (
    <div data-testid="list" data-thread={threadId}>
      <button type="button" onClick={onNavigate}>escolher</button>
    </div>
  ),
}));
vi.mock("./RailChat", () => ({ default: ({ threadId }: { threadId: string }) => <div data-testid="rail-chat" data-thread={threadId} /> }));

import ConversationScreen from "./ConversationScreen";

const renderScreen = (threadId = "thread-1") =>
  render(<NextIntlClientProvider locale="pt-BR" messages={ptBR}><ConversationScreen threadId={threadId} /></NextIntlClientProvider>);

describe("ConversationScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    context = { isPrimary: true, topic: null };
  });

  it("loads the conversation for its thread: the panel and the chat both get the id", () => {
    renderScreen("thread-7");
    expect(contextHook).toHaveBeenCalledWith("thread-7");
    expect(within(screen.getByRole("complementary", { name: "Conversas" })).getByTestId("list")).toHaveAttribute("data-thread", "thread-7");
    expect(screen.getByTestId("rail-chat")).toHaveAttribute("data-thread", "thread-7");
  });

  it("labels the main conversation 'Conversa principal' in the page heading", () => {
    renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Conversa principal" })).toBeInTheDocument();
  });

  it("labels a parallel conversation by its topic", () => {
    context = { isPrimary: false, topic: "Promoção de abril" };
    renderScreen();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Promoção de abril");
  });

  it("falls back to 'Conversa principal' while loading or when a parallel one has no topic", () => {
    context = { isPrimary: null, topic: "Qualquer" };
    const { unmount } = renderScreen();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conversa principal");
    unmount();
    context = { isPrimary: false, topic: null };
    renderScreen();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conversa principal");
  });

  it("opens the conversations list in a sheet on mobile and closes it when one is chosen", () => {
    renderScreen();
    expect(screen.getAllByTestId("list")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("conversation-list-open"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByTestId("list")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "escolher" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("names the close button of the conversations sheet in Portuguese", () => {
    renderScreen();
    fireEvent.click(screen.getByTestId("conversation-list-open"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never says Equipe", () => {
    renderScreen();
    expect(screen.getByTestId("conversation-screen").textContent).not.toMatch(/\bEquipe\b/);
  });
});
