import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
import { FIXED_REPLIES, type FixedReply } from "@/lib/equipe/fixed-replies";
import AssistantMessageList, { type AssistantDisplayMessage } from "./AssistantMessageList";

vi.mock("@/lib/hooks/use-assistant-actions", () => ({
  useConfirmAssistantAction: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelAssistantAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("./EquipePlanOffer", () => ({ default: () => <div data-testid="plan-offer" /> }));
vi.mock("./EquipeCard", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./EquipeCard")>()),
  default: ({ card }: { card: { kind: string } }) => <div data-testid="equipe-card">{card.kind}</div>,
}));

const AT = "2026-09-30T10:02:00.000Z";
const message = (over: Partial<AssistantDisplayMessage> & Pick<AssistantDisplayMessage, "id" | "type">): AssistantDisplayMessage =>
  ({ content: "", payload: {}, ...over });

function renderList(messages: AssistantDisplayMessage[], variant?: "classic" | "rail", extra: Partial<React.ComponentProps<typeof AssistantMessageList>> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <AssistantMessageList messages={messages} streamingText="" isStreaming={false} threadId="t1" variant={variant} {...extra} />
    </NextIntlClientProvider>,
  );
}

describe("AssistantMessageList: rail variant", () => {
  it("shows the person's message as a right-aligned bubble with its time", () => {
    renderList([message({ id: "u1", type: "user", content: "Meu site é acme.com", createdAt: AT })], "rail");
    const bubble = screen.getByTestId("assistant-message-user");
    expect(bubble).toHaveTextContent("Meu site é acme.com");
    expect(bubble).toHaveTextContent("10:02");
    expect(bubble).toHaveClass("ml-auto");
  });

  it("shows the Strategist's reply as a row with name, IA badge and time", () => {
    renderList([message({ id: "a1", type: "assistant", content: "Posso ler o site.", createdAt: AT })], "rail");
    const row = screen.getByTestId("strategist-row");
    expect(row).toHaveTextContent("Estrategista");
    expect(row).toHaveTextContent("IA");
    expect(row).toHaveTextContent("10:02");
    expect(row).toHaveTextContent("Posso ler o site.");
  });

  it("shares one header across consecutive Strategist messages", () => {
    renderList([
      message({ id: "a1", type: "assistant", content: "Primeira", createdAt: AT }),
      message({ id: "a2", type: "assistant", content: "Segunda", createdAt: AT }),
    ], "rail");
    const rows = screen.getAllByTestId("strategist-row");
    expect(rows[0]).toHaveTextContent("Estrategista");
    expect(rows[1]).not.toHaveTextContent("Estrategista");
  });

  it("shows the opening line in the reader's language, whatever text was stored", () => {
    renderList([message({ id: "a1", type: "assistant", content: "texto antigo gravado", payload: { handoffStep: "intro" } })], "rail");
    expect(screen.getByTestId("assistant-message-assistant")).toHaveTextContent(ptBR.assistant.handoff.introText);
    expect(screen.queryByText("texto antigo gravado")).not.toBeInTheDocument();
  });

  it("shows the library line with an icon, the count and the time", () => {
    renderList([message({ id: "e1", type: "equipe_event", content: "Biblioteca montada · 3 itens", createdAt: AT,
      payload: { kind: "library.assembled", items: 3, text: "Biblioteca montada · 3 itens" } })], "rail");
    const line = screen.getByTestId("equipe-event");
    expect(line).toHaveTextContent("Biblioteca montada · 3 itens");
    expect(line).toHaveTextContent("10:02");
    expect(line.querySelector("svg")).not.toBeNull();
  });

  it("uses the singular for one item", () => {
    renderList([message({ id: "e1", type: "equipe_event", payload: { kind: "library.assembled", items: 1 } })], "rail");
    expect(screen.getByTestId("equipe-event")).toHaveTextContent("Biblioteca montada · 1 item");
    expect(screen.getByTestId("equipe-event")).not.toHaveTextContent("1 itens");
  });

  it("tells each handoff decision from its command, not from the stored timestamped text", () => {
    renderList([message({ id: "e1", type: "equipe_event", content: "Você confirmou uma parte da marca · 2026-09-30T10:02:00.000Z",
      payload: { kind: "handoff.decided", command: "handoff_confirm_identity", text: "stored" } })], "rail");
    expect(screen.getByTestId("equipe-event")).toHaveTextContent("Você confirmou nome, logo, cores e fontes");
    expect(screen.getByTestId("equipe-event")).not.toHaveTextContent("2026-09-30");
  });

  it("offers the Strategist's suggestions as buttons that send the phrase, and filters out approval wording", () => {
    const onSuggestion = vi.fn();
    renderList([message({ id: "a1", type: "assistant", content: "Por onde começamos?",
      payload: { suggestions: ["Me explica a oportunidade 2", "Aprove o calendário"] } })], "rail", { equipeEnabled: true, onSuggestion });
    expect(screen.queryByRole("button", { name: "Aprove o calendário" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Me explica a oportunidade 2" }));
    expect(onSuggestion).toHaveBeenCalledExactlyOnceWith("Me explica a oportunidade 2");
  });

  it("disables the suggestions while the pilot flow is off", () => {
    renderList([message({ id: "a1", type: "assistant", content: "x", payload: { suggestions: ["Me explica a oportunidade 2"] } })], "rail", { equipeEnabled: false, onSuggestion: vi.fn() });
    expect(screen.getByRole("button", { name: "Me explica a oportunidade 2" })).toBeDisabled();
  });

  it("leaves only the newest handoff card in the conversation: older ones leave no trace", () => {
    const card = (id: string, step: string) => message({ id, type: "equipe_card", payload: { kind: "handoff", accountId: "acc", handoffId: "h1", step, title: "t", items: [] } });
    renderList([card("c1", "source"), card("c2", "reading")], "rail");
    expect(screen.getAllByTestId("equipe-card")).toHaveLength(1);
  });

  describe("the last handoff card once the handoff is done", () => {
    const card = (id: string, step: string) => message({ id, type: "equipe_card", payload: { kind: "handoff", accountId: "acc", handoffId: "h1", step, title: "t", items: [] } });
    const closing = message({ id: "done", type: "assistant", payload: { handoffStep: "done" } });

    it("leaves no row of the Strategist with only the name of the step: the closing line follows the decisions", () => {
      renderList([
        card("c1", "summary"),
        message({ id: "e1", type: "equipe_event", payload: { kind: "handoff.decided", command: "handoff_confirm_summary" } }),
        message({ id: "e2", type: "equipe_event", payload: { kind: "library.assembled", items: 7 } }),
        closing,
      ], "rail");
      expect(screen.queryByTestId("equipe-card")).not.toBeInTheDocument();
      // The only Strategist row left is the closing line, which now carries the header.
      const rows = screen.getAllByTestId("strategist-row");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveTextContent("Estrategista");
      expect(rows[0]).toHaveTextContent(ptBR.assistant.handoff.doneText);
    });

    it("still draws the card while the handoff is not done, even if an earlier handoff ended", () => {
      renderList([closing, card("c2", "source")], "rail");
      expect(screen.getAllByTestId("equipe-card")).toHaveLength(1);
    });
  });

  it("marks the row of a card, so the conversation can rest with the newest card at the top of the screen, and no other row", () => {
    const card = message({ id: "c1", type: "equipe_card", payload: { kind: "handoff", accountId: "acc", handoffId: "h1", step: "reading", title: "t", items: [] } });
    renderList([message({ id: "a1", type: "assistant", content: "Oi" }), card, message({ id: "u1", type: "user", content: "ok" })], "rail");
    const rows = screen.getAllByTestId("strategist-row");
    expect(rows.map((row) => row.hasAttribute("data-card-row"))).toEqual([false, true]);
  });
});

describe("AssistantMessageList: classic variant stays as it was", () => {
  it("renders a user message as the classic bubble, with no Strategist row and no time", () => {
    renderList([message({ id: "u1", type: "user", content: "Oi", createdAt: AT })]);
    expect(screen.queryByTestId("strategist-row")).not.toBeInTheDocument();
    expect(screen.getByText("Oi").closest("[data-testid]")?.textContent).not.toContain("10:02");
  });

  it("keeps the narrow gap and no centered column", () => {
    renderList([message({ id: "u1", type: "user", content: "Oi" })]);
    const list = screen.getByTestId("assistant-message-list");
    expect(list).toHaveClass("gap-3");
    expect(list).not.toHaveClass("max-w-[712px]");
  });

  it("renders an event line without a time even when the message has one", () => {
    renderList([message({ id: "e1", type: "equipe_event", content: "Algo aconteceu", createdAt: AT, payload: { kind: "support_exception.opened", text: "Algo aconteceu" } })]);
    expect(screen.getByTestId("equipe-event")).toHaveTextContent("Algo aconteceu");
    expect(screen.getByTestId("equipe-event")).not.toHaveTextContent("10:02");
  });
});

// Ticket 13, T7 of the screen review: the lines the conversation answers with when the free credit is over are stored once, in pt-BR, with their key; the list
// shows the reader's language in both layouts (like the opening line), and a message it does not know keeps its stored text.
describe("AssistantMessageList: the fixed lines of the exhausted conversation", () => {
  const KEYS = Object.keys(FIXED_REPLIES["pt-BR"]) as FixedReply[];
  const renderIn = (locale: "pt-BR" | "en", messages: AssistantDisplayMessage[], variant: "classic" | "rail") => render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ptBR}>
      <AssistantMessageList messages={messages} streamingText="" isStreaming={false} threadId="t1" variant={variant} />
    </NextIntlClientProvider>,
  );
  const stored = (key: FixedReply) => message({ id: key, type: "assistant", content: FIXED_REPLIES["pt-BR"][key], payload: { fixedReply: key } });

  for (const variant of ["classic", "rail"] as const) for (const locale of ["pt-BR", "en"] as const) for (const key of KEYS) {
    it(`${variant}, ${locale}: ${key} reads in the reader's language, once`, () => {
      renderIn(locale, [stored(key)], variant);
      expect(screen.getAllByText(FIXED_REPLIES[locale][key])).toHaveLength(1);
      // Reading in English, not a word of the stored pt-BR text.
      if (locale === "en") expect(document.body.textContent).not.toContain(FIXED_REPLIES["pt-BR"][key]);
    });
  }

  it.each(["classic", "rail"] as const)("%s: a key it does not know, or none, keeps the stored text, in either language", (variant) => {
    renderIn("en", [
      message({ id: "x1", type: "assistant", content: "texto guardado 1", payload: { fixedReply: "inventada" } }),
      message({ id: "x2", type: "assistant", content: "texto guardado 2", payload: { fixedReply: "constructor" } }),
      message({ id: "x3", type: "assistant", content: FIXED_REPLIES["pt-BR"].free_budget_exhausted }),
    ], variant);
    expect(screen.getByText("texto guardado 1")).toBeInTheDocument();
    expect(screen.getByText("texto guardado 2")).toBeInTheDocument();
    // Lines stored before the key existed carry no key: they stay as they were stored.
    expect(screen.getByText(FIXED_REPLIES["pt-BR"].free_budget_exhausted)).toBeInTheDocument();
  });

  it.each(["classic", "rail"] as const)("%s: a person's message that says the same words is never translated", (variant) => {
    renderIn("en", [message({ id: "u1", type: "user", content: "Agora não", payload: { fixedReply: "plan_later" } })], variant);
    expect(screen.getByText("Agora não")).toBeInTheDocument();
  });
});

describe("AssistantMessageList: markdown tables in the Strategist's text", () => {
  const table = "Veja o resumo:\n\n| Canal | Papel |\n| --- | --- |\n| Site | Vitrine |\n| Instagram | Prova |\n\nFechando.";

  it.each(["rail", "classic"] as const)("draws a real table in a finished reply (%s)", (variant) => {
    renderList([message({ id: "a1", type: "assistant", content: table })], variant);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Canal", "Papel"]);
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Fechando.")).toBeInTheDocument();
    expect(screen.queryByText(/\| --- \|/)).not.toBeInTheDocument();
  });

  it.each(["rail", "classic"] as const)("keeps the person's own pipes as plain text (%s)", (variant) => {
    const text = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    renderList([message({ id: "u1", type: "user", content: text })], variant);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByTestId("assistant-message-user")).toHaveTextContent("| --- | --- |");
  });

  it.each(["rail", "classic"] as const)("renders a reply that is still streaming in the middle of a table row (%s)", (variant) => {
    const streaming = (text: string) =>
      render(
        <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
          <AssistantMessageList messages={[]} streamingText={text} isStreaming threadId="t1" variant={variant} />
        </NextIntlClientProvider>,
      );
    // Header only: still plain text, no broken table.
    let view = streaming("| Canal | Papel |");
    expect(view.container.querySelector("table")).toBeNull();
    view.unmount();
    // Header and a half-written rule: still text.
    view = streaming("| Canal | Papel |\n| --- |");
    expect(view.container.querySelector("table")).toBeNull();
    view.unmount();
    // The rule is complete: the table is there and no raw rule is left over.
    view = streaming("| Canal | Papel |\n| --- | --- |");
    expect(view.container.querySelector("table")).not.toBeNull();
    expect(view.container).not.toHaveTextContent("---");
    view.unmount();
    // A body row cut short is completed with empty cells.
    view = streaming("| Canal | Papel |\n| --- | --- |\n| Site | Vit");
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(view.container.querySelectorAll("tbody td")).toHaveLength(2);
    expect(view.container).not.toHaveTextContent("---");
    view.unmount();
    view = streaming("| Canal | Papel |\n| --- | --- |\n| Site | Vitrine |\n|");
    expect(view.container.querySelectorAll("tbody tr")).toHaveLength(1);
  });
});
