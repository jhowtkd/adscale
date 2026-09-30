import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import EquipeCard, { parseEquipeCard } from "./EquipeCard";
import type { EquipeCardPayload } from "@/server/repositories/assistant-types";

vi.mock("next-intl", () => ({
  useLocale: () => "pt-BR",
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

describe("EquipeCard idea", () => {
  it("links to the idea on the ideas screen", () => {
    render(
      <EquipeCard
        equipeEnabled
        card={{
          kind: "idea",
          accountId: "acc-1",
          title: "December gifts",
          summary: "Gift kit focus",
          ideaId: "idea-1",
          items: [],
        }}
      />,
    );
    expect(screen.getByTestId("equipe-card-idea")).toHaveTextContent("Gift kit focus");
    expect(screen.getByTestId("equipe-card-idea-link")).toHaveAttribute(
      "href",
      "/ideas?account=acc-1&idea=idea-1",
    );
  });
});

describe("parseEquipeCard: diagnosis (ticket 08)", () => {
  const ready = {
    kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca",
    documentId: "doc-1", brand: "Acme", summary: "Resumo.",
    channels: [{ name: "Site", source: "site", message: "Mensagem" }],
    opportunities: [{ title: "Oportunidade", sources: ["site"] }],
    notFound: ["Preços"], suggestions: ["Me explica a oportunidade", "Montar o calendário do mês"],
  };

  it("parses a ready card with every field", () => {
    expect(parseEquipeCard(ready)).toEqual({
      kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca", items: [],
      documentId: "doc-1", brand: "Acme", summary: "Resumo.",
      channels: [{ name: "Site", source: "site", message: "Mensagem" }],
      opportunities: [{ title: "Oportunidade", sources: ["site"] }],
      notFound: ["Preços"], suggestions: ["Me explica a oportunidade", "Montar o calendário do mês"],
    });
  });

  it("parses an insufficient card with no opportunities", () => {
    const card = parseEquipeCard({ ...ready, status: "insufficient", channels: [], opportunities: [], notFound: [] });
    expect(card).toMatchObject({ kind: "diagnosis", status: "insufficient", opportunities: [], channels: [], notFound: [] });
  });

  it("parses a failed card without documentId or summary", () => {
    const card = parseEquipeCard({ kind: "diagnosis", status: "failed", accountId: "acc-1", title: "x", suggestions: ["Tentar de novo"] });
    expect(card).toMatchObject({ kind: "diagnosis", status: "failed", accountId: "acc-1", suggestions: ["Tentar de novo"] });
    expect(card?.documentId).toBeUndefined();
    expect(card?.summary).toBeUndefined();
  });

  it("defaults the title to an empty string when it is not a string", () => {
    expect(parseEquipeCard({ ...ready, title: 42 })?.title).toBe("");
  });

  it.each([
    ["no accountId", { ...ready, accountId: undefined }],
    ["an empty accountId", { ...ready, accountId: "" }],
    ["no status", { ...ready, status: undefined }],
    ["an unknown status", { ...ready, status: "pending" }],
    ["a ready card without documentId", { ...ready, documentId: undefined }],
    ["a ready card with an empty documentId", { ...ready, documentId: "" }],
    ["a ready card without summary", { ...ready, summary: undefined }],
    ["a ready card without opportunities", { ...ready, opportunities: undefined }],
    ["an insufficient card without documentId", { ...ready, status: "insufficient", documentId: undefined }],
  ])("rejects %s", (_label, payload) => {
    expect(parseEquipeCard(payload as Record<string, unknown>)).toBeNull();
  });

  it("drops malformed channels, opportunities and notFound entries but keeps the valid ones", () => {
    const card = parseEquipeCard({
      ...ready,
      channels: [
        { name: "Site", source: "site", message: "ok" },
        null, "texto", { name: "Instagram", source: "instagram" }, { source: "site", message: "sem nome" }, { name: 1, source: "site", message: "x" },
      ],
      opportunities: [{ title: "Boa", sources: ["site", 3, "instagram"] }, { sources: ["site"] }, null, { title: 9 }, { title: "Sem fontes" }],
      notFound: ["Preços", 7, null, "Depoimentos"],
    });
    expect(card?.channels).toEqual([{ name: "Site", source: "site", message: "ok" }]);
    expect(card?.opportunities).toEqual([{ title: "Boa", sources: ["site", "instagram"] }, { title: "Sem fontes", sources: [] }]);
    expect(card?.notFound).toEqual(["Preços", "Depoimentos"]);
  });

  it("treats non-array channels and notFound as empty", () => {
    const card = parseEquipeCard({ ...ready, channels: "x", notFound: { a: 1 } });
    expect(card?.channels).toEqual([]);
    expect(card?.notFound).toEqual([]);
  });

  it("runs suggestions through filterSuggestions: no approval verbs, no duplicates, at most three", () => {
    const card = parseEquipeCard({
      ...ready,
      suggestions: ["Aprovar tudo", "Me explica", "Me explica", "  Montar o calendário  ", "Outra ideia", "Mais uma", 5, ""],
    });
    expect(card?.suggestions).toEqual(["Me explica", "Montar o calendário", "Outra ideia"]);
  });

  it("returns no suggestions when the field is missing or not an array", () => {
    expect(parseEquipeCard({ ...ready, suggestions: undefined })?.suggestions).toEqual([]);
    expect(parseEquipeCard({ ...ready, suggestions: "Tentar de novo" })?.suggestions).toEqual([]);
  });
});

describe("EquipeCard diagnosis routing (ticket 08)", () => {
  const card: EquipeCardPayload = {
    kind: "diagnosis", status: "ready", accountId: "acc-1", title: "Diagnóstico da marca", items: [],
    documentId: "doc-1", brand: "Acme", summary: "Resumo do diagnóstico.",
    channels: [], opportunities: [{ title: "Oportunidade", sources: ["site"] }], notFound: [],
    suggestions: ["Me explica a oportunidade", "Montar o calendário do mês"],
  };

  it("renders the DiagnosisCard, not the approval card", () => {
    render(<EquipeCard card={card} equipeEnabled />);
    expect(screen.getByTestId("equipe-diagnosis")).toHaveTextContent("Resumo do diagnóstico.");
    expect(screen.queryByTestId("equipe-card")).not.toBeInTheDocument();
  });

  it("forwards onSuggestion so a click sends the isca text", () => {
    const onSuggestion = vi.fn();
    render(<EquipeCard card={card} equipeEnabled onSuggestion={onSuggestion} />);
    fireEvent.click(within(screen.getByTestId("assistant-suggestions")).getByRole("button", { name: "Montar o calendário do mês" }));
    expect(onSuggestion).toHaveBeenCalledWith("Montar o calendário do mês");
  });

  it("forwards latest=false: no iscas on an older diagnosis", () => {
    render(<EquipeCard card={card} equipeEnabled latest={false} onSuggestion={vi.fn()} />);
    expect(screen.queryByTestId("assistant-suggestions")).not.toBeInTheDocument();
  });

  it("forwards disabled: iscas cannot be clicked", () => {
    const onSuggestion = vi.fn();
    render(<EquipeCard card={card} equipeEnabled disabled onSuggestion={onSuggestion} />);
    for (const button of within(screen.getByTestId("assistant-suggestions")).getAllByRole("button")) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onSuggestion).not.toHaveBeenCalled();
  });

  it("equipeEnabled=false disables the iscas even when not disabled explicitly", () => {
    const onSuggestion = vi.fn();
    render(<EquipeCard card={card} equipeEnabled={false} onSuggestion={onSuggestion} />);
    for (const button of within(screen.getByTestId("assistant-suggestions")).getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(onSuggestion).not.toHaveBeenCalled();
  });
});
