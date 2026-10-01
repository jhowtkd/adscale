import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import DiagnosisCard from "./DiagnosisCard";
import ptBR from "../../../messages/pt-BR.json";
import type { DiagnosisContent } from "@/server/equipe/handoff/diagnosis-contract";
import type { EquipeCardPayload } from "@/server/repositories/assistant-types";

const mockUseEquipeAccountState = vi.fn();
vi.mock("@/lib/equipe/use-equipe", () => ({
  useEquipeAccountState: (...args: unknown[]) => mockUseEquipeAccountState(...args),
}));

const copy = ptBR.assistant.equipe.diagnosis;

beforeEach(() => {
  vi.clearAllMocks();
  mockUseEquipeAccountState.mockReturnValue({ data: undefined, isLoading: false });
});

function storedContent(overrides: Partial<DiagnosisContent> = {}): DiagnosisContent {
  return {
    status: "complete", brand: "Acme", summary: "Resumo guardado no documento.",
    channels: [{ name: "Site", source: "site", message: "Mensagem do site guardada" }],
    opportunities: [{ title: "Oportunidade guardada", sources: ["site"] }],
    notFound: [],
    sources: [{ origin: "site", quote: "Trecho literal do site", supports: "summary" }],
    meta: { readingId: "reading-1", taskIntentId: null, model: null, promptVersion: null, inputSources: ["site"] },
    ...overrides,
  };
}

function readyCard(overrides: Partial<EquipeCardPayload> = {}): EquipeCardPayload {
  return {
    kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca", items: [],
    documentId: "doc-1", brand: "Acme", summary: "Resumo do card.",
    channels: [
      { name: "Site", source: "site", message: "O site fala de café especial" },
      { name: "Instagram", source: "instagram", message: "O Instagram mostra bastidores" },
    ],
    opportunities: [{ title: "Mostrar a torra", sources: ["site"] }, { title: "Contar a origem", sources: ["instagram"] }],
    notFound: [],
    suggestions: ["Me explica a oportunidade 1", "Montar o calendário do mês"],
    ...overrides,
  };
}

function renderCard(card: EquipeCardPayload, props: Partial<{ latest: boolean; disabled: boolean; onSuggestion: (text: string) => void }> = {}) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <DiagnosisCard card={card} {...props} />
    </NextIntlClientProvider>,
  );
}

describe("DiagnosisCard states", () => {
  it("ready: names the brand, shows summary, channels by origin and numbered opportunities", () => {
    renderCard(readyCard());
    const root = screen.getByTestId("equipe-diagnosis");

    expect(within(root).getByText("O diagnóstico de Acme está pronto.")).toBeInTheDocument();
    expect(within(root).getByRole("heading", { name: /Diagnóstico da marca/ })).toBeInTheDocument();
    expect(within(root).getByText("Resumo do card.")).toBeInTheDocument();
    expect(within(root).getByText("O site fala de café especial")).toBeInTheDocument();
    expect(within(root).getByText("O Instagram mostra bastidores")).toBeInTheDocument();
    expect(within(root).getByText("Site")).toBeInTheDocument();
    expect(within(root).getByText("Instagram")).toBeInTheDocument();
    expect(within(root).getByText("2 oportunidades")).toBeInTheDocument();

    const items = within(within(root).getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1Mostrar a torra");
    expect(items[1]).toHaveTextContent("2Contar a origem");
    expect(within(root).getByRole("button", { name: copy.open })).toBeInTheDocument();
  });

  it("ready without a brand falls back to the generic intro", () => {
    renderCard(readyCard({ brand: null }));
    expect(screen.getByText(copy.readyIntroGeneric)).toBeInTheDocument();
    expect(screen.queryByText(/O diagnóstico de/)).not.toBeInTheDocument();
  });

  it("ready with a single opportunity uses the singular label", () => {
    renderCard(readyCard({ opportunities: [{ title: "Só uma", sources: ["site"] }] }));
    expect(screen.getByText("1 oportunidade")).toBeInTheDocument();
  });

  it("insufficient: says so, shows the summary, no opportunities and still offers the document", () => {
    renderCard(readyCard({ status: "insufficient", opportunities: [], channels: [], summary: "Pouco texto público." }));
    const root = screen.getByTestId("equipe-diagnosis");

    expect(within(root).getByText(copy.insufficientIntro)).toBeInTheDocument();
    expect(within(root).getByText("Pouco texto público.")).toBeInTheDocument();
    expect(within(root).getByText(copy.noOpportunities)).toBeInTheDocument();
    expect(within(root).queryByRole("list")).not.toBeInTheDocument();
    expect(within(root).getByRole("button", { name: copy.open })).toBeInTheDocument();
  });

  it("failed: only the notice, no summary, no opportunities and no document button", () => {
    renderCard({ kind: "diagnosis", status: "failed", accountId: "acc-1", title: "Diagnóstico da marca", items: [], suggestions: ["Tentar de novo"] });
    const root = screen.getByTestId("equipe-diagnosis");

    expect(within(root).getByText(copy.failedIntro)).toBeInTheDocument();
    expect(within(root).getByRole("status")).toHaveTextContent(copy.failedDetail);
    expect(within(root).queryByRole("button", { name: copy.open })).not.toBeInTheDocument();
    expect(within(root).queryByText(copy.noOpportunities)).not.toBeInTheDocument();
    expect(within(root).queryByRole("heading")).not.toBeInTheDocument();
  });

  it("single source: a card without channels does not render the channels block", () => {
    renderCard(readyCard({ channels: undefined }));
    const root = screen.getByTestId("equipe-diagnosis");
    expect(within(root).queryByText(copy.fromSite)).not.toBeInTheDocument();
    expect(within(root).queryByText(copy.fromInstagram)).not.toBeInTheDocument();
    expect(within(root).getByText("Resumo do card.")).toBeInTheDocument();
  });

  it("single source: an empty channels list renders no block either", () => {
    renderCard(readyCard({ channels: [] }));
    expect(screen.queryByText(copy.fromSite)).not.toBeInTheDocument();
  });

  it("notFound: lists the gaps and states nothing was invented; absent or empty shows no line", () => {
    const { unmount } = renderCard(readyCard({ notFound: ["Instagram", "Preços"] }));
    expect(screen.getByText(/Não encontrado: Instagram e Preços\. Nada foi inventado\./)).toBeInTheDocument();
    unmount();

    renderCard(readyCard({ notFound: [] }));
    expect(screen.queryByText(/Nada foi inventado/)).not.toBeInTheDocument();
  });
});

describe("DiagnosisCard iscas (suggestions)", () => {
  it("the latest card offers its iscas and a click sends the exact text", () => {
    const onSuggestion = vi.fn();
    renderCard(readyCard(), { onSuggestion });
    const container = screen.getByTestId("assistant-suggestions");

    expect(within(container).getAllByRole("button")).toHaveLength(2);
    fireEvent.click(within(container).getByRole("button", { name: "Me explica a oportunidade 1" }));
    expect(onSuggestion).toHaveBeenCalledTimes(1);
    expect(onSuggestion).toHaveBeenCalledWith("Me explica a oportunidade 1");
  });

  it("latest defaults to true", () => {
    renderCard(readyCard(), { onSuggestion: vi.fn() });
    expect(screen.getByTestId("assistant-suggestions")).toBeInTheDocument();
  });

  it("a card that is not the latest shows no iscas but keeps its content", () => {
    renderCard(readyCard(), { latest: false, onSuggestion: vi.fn() });
    expect(screen.queryByTestId("assistant-suggestions")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Montar o calendário do mês" })).not.toBeInTheDocument();
    expect(screen.getByText("Resumo do card.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.open })).toBeInTheDocument();
  });

  it("no iscas container when the card carries none", () => {
    renderCard(readyCard({ suggestions: [] }), { onSuggestion: vi.fn() });
    expect(screen.queryByTestId("assistant-suggestions")).not.toBeInTheDocument();
  });

  it("disabled: iscas are visible but cannot be clicked", () => {
    const onSuggestion = vi.fn();
    renderCard(readyCard(), { disabled: true, onSuggestion });
    const buttons = within(screen.getByTestId("assistant-suggestions")).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("without onSuggestion the iscas are disabled", () => {
    renderCard(readyCard());
    for (const button of within(screen.getByTestId("assistant-suggestions")).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
  });

  it("failed cards still offer the retry isca", () => {
    const onSuggestion = vi.fn();
    renderCard({ kind: "diagnosis", status: "failed", accountId: "acc-1", title: "x", items: [], suggestions: ["Tentar de novo"] }, { onSuggestion });
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(onSuggestion).toHaveBeenCalledWith("Tentar de novo");
  });
});

describe("DiagnosisCard document dialog", () => {
  const openDialog = () => {
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    return within(screen.getByRole("dialog"));
  };

  it("does not read the account state while the dialog is closed", () => {
    renderCard(readyCard());
    expect(mockUseEquipeAccountState).not.toHaveBeenCalled();
  });

  it("shows the stored document for the card's documentId, with its version", () => {
    mockUseEquipeAccountState.mockReturnValue({
      isLoading: false,
      data: { documents: [
        { id: "doc-other", version: 1, content: storedContent({ summary: "Outro documento." }) },
        { id: "doc-1", version: 2, content: storedContent() },
      ] },
    });
    renderCard(readyCard());
    const dialog = openDialog();

    expect(mockUseEquipeAccountState).toHaveBeenLastCalledWith("acc-1");
    expect(dialog.getByTestId("diagnosis-document")).toBeInTheDocument();
    expect(dialog.getByText("Resumo guardado no documento.")).toBeInTheDocument();
    expect(dialog.getByText("Trecho literal do site", { exact: false })).toBeInTheDocument();
    expect(dialog.getByText("Versão 2")).toBeInTheDocument();
    expect(dialog.queryByText("Resumo do card.")).not.toBeInTheDocument();
    expect(dialog.queryByText("Outro documento.")).not.toBeInTheDocument();
  });

  it("falls back to the card content while the account state is loading", () => {
    mockUseEquipeAccountState.mockReturnValue({ data: undefined, isLoading: true });
    renderCard(readyCard());
    const dialog = openDialog();

    expect(dialog.getByText(copy.loadingDocument)).toBeInTheDocument();
    expect(dialog.getByTestId("diagnosis-document")).toBeInTheDocument();
    expect(dialog.getByText("Resumo do card.")).toBeInTheDocument();
    expect(dialog.getByText("Mostrar a torra")).toBeInTheDocument();
  });

  it("falls back to the card content when the document is not in the account view", () => {
    mockUseEquipeAccountState.mockReturnValue({ isLoading: false, data: { documents: [{ id: "doc-other", version: 1, content: storedContent() }] } });
    renderCard(readyCard());
    const dialog = openDialog();

    expect(dialog.getByText("Resumo do card.")).toBeInTheDocument();
    expect(dialog.queryByText(/^Versão/)).not.toBeInTheDocument();
    expect(dialog.queryByText(copy.loadingDocument)).not.toBeInTheDocument();
    // The brand is the description when there is no stored version.
    expect(dialog.getByText("Acme")).toBeInTheDocument();
  });

  it("falls back to the card content when the account state has no documents", () => {
    mockUseEquipeAccountState.mockReturnValue({ isLoading: false, data: {} });
    renderCard(readyCard());
    expect(openDialog().getByText("Resumo do card.")).toBeInTheDocument();
  });

  it("falls back to the card content when the stored content is invalid", () => {
    mockUseEquipeAccountState.mockReturnValue({
      isLoading: false,
      data: { documents: [{ id: "doc-1", version: 3, content: { summary: "incompleto" } }] },
    });
    renderCard(readyCard());
    const dialog = openDialog();

    expect(dialog.getByTestId("diagnosis-document")).toBeInTheDocument();
    expect(dialog.getByText("Resumo do card.")).toBeInTheDocument();
    expect(dialog.queryByText("incompleto")).not.toBeInTheDocument();
  });

  it("fallback document keeps the insufficient state: empty opportunities text and no excerpts section", () => {
    renderCard(readyCard({ status: "insufficient", opportunities: [], channels: [], summary: "Pouco texto público." }));
    const dialog = openDialog();

    expect(dialog.getByText("Pouco texto público.")).toBeInTheDocument();
    expect(dialog.getByText(copy.noOpportunities)).toBeInTheDocument();
    expect(dialog.queryByText(copy.documentSources)).not.toBeInTheDocument();
  });

  it("closes from the dialog close button", () => {
    renderCard(readyCard());
    const dialog = openDialog();
    // The close button speaks the reader's language, like the other surfaces of the pilot.
    expect(dialog.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("DiagnosisCard fallback with unknown channel sources", () => {
  it("a channel from an unknown source does not empty the dialog: the valid content is shown", () => {
    mockUseEquipeAccountState.mockReturnValue({ data: undefined, isLoading: false });
    renderCard(readyCard({ channels: [
      { name: "TikTok", source: "tiktok", message: "Mensagem do TikTok" },
      { name: "Site", source: "site", message: "O site fala de café especial" },
    ] }));
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByTestId("diagnosis-document")).toBeInTheDocument();
    expect(dialog.getByText("Resumo do card.")).toBeInTheDocument();
    expect(dialog.getByText("O site fala de café especial", { exact: false })).toBeInTheDocument();
    expect(dialog.queryByText("Mensagem do TikTok", { exact: false })).not.toBeInTheDocument();
  });

  it("a channel with a known source but a mismatched name is dropped too", () => {
    renderCard(readyCard({ channels: [{ name: "Facebook", source: "site", message: "Nome trocado" }] }));
    fireEvent.click(screen.getByRole("button", { name: copy.open }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByTestId("diagnosis-document")).toBeInTheDocument();
    expect(dialog.queryByText("Nome trocado", { exact: false })).not.toBeInTheDocument();
  });
});
