import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ptBR from "../../../../messages/pt-BR.json";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }) }));
type Context = {
  accountId: string | null; clientProfileId: string | null; accountStatus: string | null; isPrimary: boolean | null; topic: string | null;
  parallel: Array<{ id: string; assistantThreadId: string | null; topic: string | null }>;
};
let context: Context;
const contextHook = vi.fn((id: string | null) => { void id; return context; });
vi.mock("@/lib/equipe/use-conversation-context", () => ({ useConversationContext: (id: string | null) => contextHook(id) }));
vi.mock("@/components/layout/rail/NewConversationDialog", () => ({
  default: (props: { open: boolean; accountId: string | null; clientProfileId: string | null }) =>
    props.open ? <div role="dialog" data-account={props.accountId} data-profile={props.clientProfileId}>diálogo</div> : null,
}));

import ConversationList, { matchesSearch } from "./ConversationList";
import { RailSearchProvider, useRailSearch } from "@/components/layout/rail/rail-search";

const parallel = [
  { id: "t1", assistantThreadId: "thread-1", topic: "Promoção de abril" },
  { id: "t2", assistantThreadId: "thread-2", topic: "Lançamento do café" },
  { id: "t3", assistantThreadId: null, topic: "Sem conversa vinculada" },
];

const renderList = (props: { threadId: string | null; onNavigate?: () => void } = { threadId: "thread-main" }, extra?: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <RailSearchProvider>
        <ConversationList {...props} />
        {extra}
      </RailSearchProvider>
    </NextIntlClientProvider>,
  );

describe("matchesSearch", () => {
  it.each([
    ["Promoção de abril", "promocao", true],
    ["Promoção de abril", "PROMOÇÃO", true],
    ["Promoção de abril", "  abril ", true],
    ["Promoção de abril", "maio", false],
    ["Conversa principal", "", true],
    ["Conversa principal", "   ", true],
    ["", "x", false],
  ])("matches %j against %j: %s", (text, query, expected) => {
    expect(matchesSearch(text, query)).toBe(expected);
  });
});

describe("ConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/";
    context = { accountId: "acc-1", clientProfileId: "profile-1", accountStatus: "free", isPrimary: true, topic: null, parallel };
  });

  it("lists the main conversation first, then the parallel ones", () => {
    renderList();
    const nav = screen.getByRole("navigation", { name: "Conversas" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Conversa principal", "Promoção de abril", "Lançamento do café"]);
    expect(links[0]).toHaveAttribute("href", "/");
  });

  it("links each parallel conversation to /assistant?threadId=, skipping ones with no bound thread", () => {
    renderList();
    const list = screen.getByRole("list", { name: "Conversas paralelas" });
    expect(within(list).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/assistant?threadId=thread-1",
      "/assistant?threadId=thread-2",
    ]);
    expect(screen.queryByText("Sem conversa vinculada")).not.toBeInTheDocument();
  });

  it("selects the main conversation on / and on the account's primary thread", () => {
    renderList();
    expect(screen.getByRole("link", { name: "Conversa principal" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Promoção de abril" })).not.toHaveAttribute("aria-current");
  });

  it("always selects the main conversation on /, even before the account state is known", () => {
    context = { ...context, isPrimary: null };
    renderList();
    expect(screen.getByRole("link", { name: "Conversa principal" })).toHaveAttribute("aria-current", "page");
  });

  it("selects the parallel conversation being read, and no longer the main one", () => {
    pathname = "/assistant";
    context = { ...context, isPrimary: false };
    renderList({ threadId: "thread-2" });
    expect(screen.getByRole("link", { name: "Lançamento do café" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Promoção de abril" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Conversa principal" })).not.toHaveAttribute("aria-current");
  });

  it("selects the main conversation when /assistant shows the primary thread", () => {
    pathname = "/assistant";
    renderList({ threadId: "thread-main" });
    expect(screen.getByRole("link", { name: "Conversa principal" })).toHaveAttribute("aria-current", "page");
  });

  it("does not select the main conversation while the account state is still loading on /assistant", () => {
    pathname = "/assistant";
    context = { ...context, isPrimary: null };
    renderList({ threadId: "thread-1" });
    expect(screen.getByRole("link", { name: "Conversa principal" })).not.toHaveAttribute("aria-current");
  });

  it("filters by topic, ignoring case and accents, and says so when nothing matches", () => {
    renderList();
    const search = screen.getByRole("searchbox", { name: "Buscar" });
    fireEvent.change(search, { target: { value: "promocao" } });
    expect(screen.getByRole("link", { name: "Promoção de abril" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lançamento do café" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Conversa principal" })).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "zzz" } });
    expect(screen.getByTestId("conversation-parallel-empty")).toHaveTextContent("Nada encontrado.");
  });

  it("keeps the main conversation when the search matches its name", () => {
    renderList();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar" }), { target: { value: "principal" } });
    expect(screen.getByRole("link", { name: "Conversa principal" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Promoção de abril" })).not.toBeInTheDocument();
  });

  it("shows no 'nothing found' message while the search is empty, even with no parallel conversations", () => {
    context = { ...context, parallel: [] };
    renderList();
    expect(screen.queryByTestId("conversation-parallel-empty")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Conversas paralelas" })).not.toBeInTheDocument();
  });

  it("opens the new-conversation dialog for the account and its brand", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Nova conversa" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-account", "acc-1");
    expect(dialog).toHaveAttribute("data-profile", "profile-1");
  });

  it("calls onNavigate when a conversation is chosen, so a sheet can close", () => {
    const onNavigate = vi.fn();
    renderList({ threadId: "thread-main", onNavigate });
    fireEvent.click(screen.getByRole("link", { name: "Promoção de abril" }));
    fireEvent.click(screen.getByRole("link", { name: "Conversa principal" }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("offers its search field to the rail's Buscar", () => {
    function Press() {
      const rail = useRailSearch();
      return <button onClick={() => rail?.request()}>rail-buscar</button>;
    }
    renderList({ threadId: "thread-main" }, <Press />);
    fireEvent.click(screen.getByRole("button", { name: "rail-buscar" }));
    expect(screen.getByRole("searchbox", { name: "Buscar" })).toHaveFocus();
  });

  it("asks the context about the thread it was given", () => {
    renderList({ threadId: "thread-9" });
    expect(contextHook).toHaveBeenCalledWith("thread-9");
  });
});
