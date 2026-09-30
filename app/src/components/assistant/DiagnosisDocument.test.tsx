import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import DiagnosisDocument, { parseDiagnosisContent } from "./DiagnosisDocument";
import ptBR from "../../../messages/pt-BR.json";
import type { DiagnosisContent } from "@/server/equipe/handoff/diagnosis-contract";

const copy = ptBR.assistant.equipe.diagnosis;

function content(overrides: Partial<DiagnosisContent> = {}): DiagnosisContent {
  return {
    status: "complete", brand: "Acme", summary: "Torrefação artesanal com foco em origem.",
    channels: [
      { name: "Site", source: "site", message: "O site vende grãos por assinatura" },
      { name: "Instagram", source: "instagram", message: "O Instagram mostra a rotina da torra" },
    ],
    opportunities: [
      { title: "Explicar a assinatura", sources: ["site"] },
      { title: "Mostrar a rotina", sources: ["instagram", "site"] },
    ],
    notFound: ["Preços", "Depoimentos"],
    sources: [
      { origin: "site", quote: "grãos por assinatura todo mês", supports: "summary" },
      { origin: "instagram", quote: "acordamos às 5h para torrar", supports: "channel:instagram" },
      { origin: "site", quote: "assine e receba em casa", supports: "opportunity:2" },
    ],
    meta: { readingId: "reading-1", taskIntentId: null, model: null, promptVersion: null, inputSources: ["site", "instagram"] },
    ...overrides,
  };
}

function renderDoc(value: DiagnosisContent) {
  return render(
    <NextIntlClientProvider locale="pt-BR" messages={ptBR}>
      <DiagnosisDocument content={value} />
    </NextIntlClientProvider>,
  );
}

function section(title: string) {
  const heading = screen.getByRole("heading", { name: title });
  return within(heading.closest("section") as HTMLElement);
}

describe("DiagnosisDocument", () => {
  it("renders every section of a complete document in reading order", () => {
    renderDoc(content());
    const headings = screen.getAllByRole("heading").map(heading => heading.textContent);
    expect(headings).toEqual([copy.documentSummary, copy.documentChannels, copy.documentOpportunities, copy.documentNotFound, copy.documentSources]);

    expect(section(copy.documentSummary).getByText("Torrefação artesanal com foco em origem.")).toBeInTheDocument();
    const channels = section(copy.documentChannels);
    expect(channels.getByText("O site vende grãos por assinatura")).toBeInTheDocument();
    expect(channels.getByText("O Instagram mostra a rotina da torra")).toBeInTheDocument();
    const gaps = section(copy.documentNotFound).getAllByRole("listitem");
    expect(gaps.map(item => item.textContent)).toEqual(["Preços", "Depoimentos"]);
  });

  it("lists opportunities as an ordered list with the origin of each", () => {
    renderDoc(content());
    const items = section(copy.documentOpportunities).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Explicar a assinatura");
    expect(items[0]).toHaveTextContent("Site");
    expect(items[1]).toHaveTextContent("Mostrar a rotina");
    expect(items[1]).toHaveTextContent("Instagram · Site");
    expect(items[0].parentElement?.tagName).toBe("OL");
  });

  it("shows each excerpt with its origin and what it supports", () => {
    renderDoc(content());
    const sources = section(copy.documentSources).getAllByRole("listitem");
    expect(sources).toHaveLength(3);

    expect(sources[0]).toHaveTextContent(`${copy.fromSite} · ${copy.supportsSummary}`);
    expect(sources[0]).toHaveTextContent("“grãos por assinatura todo mês”");
    expect(sources[1]).toHaveTextContent(`${copy.fromInstagram} · ${copy.supportsChannel} · ${copy.fromInstagram}`);
    expect(sources[1]).toHaveTextContent("“acordamos às 5h para torrar”");
    expect(sources[2]).toHaveTextContent(`${copy.fromSite} · Oportunidade 2`);
    expect(sources[2]).toHaveTextContent("“assine e receba em casa”");
  });

  it("insufficient: shows the empty-opportunities text and no excerpts section", () => {
    renderDoc(content({ status: "insufficient", channels: [], opportunities: [], notFound: ["Site"], sources: [] }));

    expect(section(copy.documentOpportunities).getByText(copy.noOpportunities)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.documentSources })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.documentChannels })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.documentSummary })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: copy.documentNotFound })).toBeInTheDocument();
  });

  it("omits the not-found section when nothing is missing", () => {
    renderDoc(content({ notFound: [] }));
    expect(screen.queryByRole("heading", { name: copy.documentNotFound })).not.toBeInTheDocument();
  });

  it("exposes a stable test id", () => {
    renderDoc(content());
    expect(screen.getByTestId("diagnosis-document")).toBeInTheDocument();
  });
});

describe("parseDiagnosisContent", () => {
  it("returns the content for a valid document", () => {
    const value = content();
    expect(parseDiagnosisContent(value)).toEqual(value);
  });

  it("accepts an insufficient document", () => {
    const value = content({ status: "insufficient", channels: [], opportunities: [], sources: [] });
    expect(parseDiagnosisContent(value)).toEqual(value);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "diagnóstico"],
    ["an empty object", {}],
    ["a generic brand document", { title: "Diagnóstico da marca", summary: "Resumo", strengths: ["a"] }],
  ])("returns null for %s", (_label, value) => {
    expect(parseDiagnosisContent(value)).toBeNull();
  });

  it("returns null for an incomplete object (no meta)", () => {
    const incomplete: Partial<DiagnosisContent> = content();
    delete incomplete.meta;
    expect(parseDiagnosisContent(incomplete)).toBeNull();
  });

  it("returns null for an unknown status, an unknown source or more than three opportunities", () => {
    expect(parseDiagnosisContent({ ...content(), status: "ready" })).toBeNull();
    expect(parseDiagnosisContent({ ...content(), sources: [{ origin: "tiktok", quote: "x", supports: "summary" }] })).toBeNull();
    const four = Array.from({ length: 4 }, (_, index) => ({ title: `Op ${index}`, sources: ["site"] }));
    expect(parseDiagnosisContent({ ...content(), opportunities: four })).toBeNull();
  });
});

describe("DiagnosisDocument unknown supports", () => {
  it("shows an unrecognized `supports` value as it is, never as 'Oportunidade 1'", () => {
    renderDoc(content({ sources: [{ origin: "site", quote: "trecho de teste", supports: "foo" }] }));
    const item = section(copy.documentSources).getAllByRole("listitem")[0]!;
    expect(item).toHaveTextContent(`${copy.fromSite} · foo`);
    expect(item).not.toHaveTextContent("Oportunidade 1");
  });

  it("still numbers recognized opportunity supports", () => {
    renderDoc(content({ sources: [{ origin: "site", quote: "trecho de teste", supports: "opportunity:3" }] }));
    expect(section(copy.documentSources).getAllByRole("listitem")[0]).toHaveTextContent("Oportunidade 3");
  });
});
