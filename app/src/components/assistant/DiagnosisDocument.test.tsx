import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import DiagnosisDocument, { parseDiagnosisContent, type DiagnosisSourceLinks } from "./DiagnosisDocument";
import ptBR from "../../../messages/pt-BR.json";
import en from "../../../messages/en.json";
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

function renderDoc(value: DiagnosisContent, sourceLinks?: DiagnosisSourceLinks, locale: "pt-BR" | "en" = "pt-BR") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ptBR}>
      <DiagnosisDocument content={value} sourceLinks={sourceLinks} />
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
    expect(headings).toEqual([copy.documentSummary, copy.documentChannels, copy.documentOpportunities, copy.documentNotFound, copy.documentSources, copy.quotesFromSite, copy.quotesFromInstagram]);

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

  it("shows the excerpts as quotations grouped by origin, each footed by what it supports", () => {
    renderDoc(content());
    const quotes = section(copy.documentSources);
    const site = within(screen.getByTestId("diagnosis-quotes-site"));
    const instagram = within(screen.getByTestId("diagnosis-quotes-instagram"));
    expect(site.getByRole("heading", { level: 4, name: "O que está escrito no seu site" })).toBeInTheDocument();
    expect(instagram.getByRole("heading", { level: 4, name: "O que está escrito no seu Instagram" })).toBeInTheDocument();
    expect(quotes.getAllByRole("listitem")).toHaveLength(3);

    const siteQuotes = site.getAllByRole("listitem").map(item => item.querySelector("blockquote")!);
    expect(siteQuotes.map(q => q.querySelector("p")?.textContent)).toEqual(["“grãos por assinatura todo mês”", "“assine e receba em casa”"]);
    expect(siteQuotes.map(q => q.querySelector("footer")?.textContent)).toEqual([copy.supportsSummary, "Oportunidade 2"]);
    const [igQuote] = instagram.getAllByRole("listitem").map(item => item.querySelector("blockquote")!);
    expect(igQuote!.querySelector("p")?.textContent).toBe("“acordamos às 5h para torrar”");
    expect(igQuote!.querySelector("footer")?.textContent).toBe(`${copy.supportsChannel} · ${copy.fromInstagram}`);
  });

  it("says in the section that the excerpts are copied, not written by the AI", () => {
    renderDoc(content());
    expect(screen.getByRole("heading", { name: "Citações que sustentam o diagnóstico" })).toBeInTheDocument();
    expect(screen.getByText(/Não foram escritos pela IA/)).toBeInTheDocument();
  });

  it("colors the side bar of a quote by its origin", () => {
    renderDoc(content());
    const bar = (testId: string) => (screen.getByTestId(testId).querySelector("blockquote") as HTMLElement).style.borderLeftColor;
    expect(bar("diagnosis-quotes-site")).toBe("var(--warning-dot)");
    expect(bar("diagnosis-quotes-instagram")).toBe("var(--info-dot)");
    expect(screen.getByTestId("diagnosis-quotes-site").querySelector("blockquote")!.className).toContain("border-l-");
  });

  it("shows a line that is on the site, like a Lorem ipsum, whole and literal inside the quote", () => {
    const lorem = "Lorem ipsum dolor sit amet, consectetur adipiscing elit";
    renderDoc(content({ sources: [{ origin: "site", quote: lorem, supports: "summary" }] }));
    expect(screen.getByText(`“${lorem}”`).closest("blockquote")).not.toBeNull();
    expect(screen.getByTestId("diagnosis-quotes-site")).toHaveTextContent(lorem);
  });

  it("renders only the group of the origin that has quotes", () => {
    renderDoc(content({ sources: [{ origin: "site", quote: "só do site", supports: "summary" }] }));
    expect(screen.getByRole("heading", { name: copy.quotesFromSite })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: copy.quotesFromInstagram })).not.toBeInTheDocument();
    expect(screen.queryByTestId("diagnosis-quotes-instagram")).not.toBeInTheDocument();
  });

  it("has no link without sourceLinks", () => {
    renderDoc(content());
    expect(section(copy.documentSources).queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("blockquote[cite]")).toBeNull();
  });

  it("links each group to its source, in a new tab, safely, and cites it", () => {
    renderDoc(content(), {
      site: { href: "https://acme.com/", label: "acme.com" },
      instagram: { href: "https://www.instagram.com/acme/", label: "@acme" },
    });
    const site = screen.getByRole("link", { name: "Abrir acme.com em outra aba" });
    expect(site).toHaveAttribute("href", "https://acme.com/");
    expect(site).toHaveAttribute("target", "_blank");
    expect(site).toHaveAttribute("rel", "noopener noreferrer");
    expect(site).toHaveTextContent("acme.com");
    expect(within(screen.getByTestId("diagnosis-quotes-site")).getByRole("link")).toBe(site);
    const ig = screen.getByRole("link", { name: "Abrir @acme em outra aba" });
    expect(ig).toHaveAttribute("href", "https://www.instagram.com/acme/");
    expect(within(screen.getByTestId("diagnosis-quotes-instagram")).getByRole("link")).toBe(ig);
    expect(screen.getByTestId("diagnosis-quotes-site").querySelector("blockquote")).toHaveAttribute("cite", "https://acme.com/");
    expect(screen.getByTestId("diagnosis-quotes-instagram").querySelector("blockquote")).toHaveAttribute("cite", "https://www.instagram.com/acme/");
  });

  it("links only the group whose link was given", () => {
    renderDoc(content(), { site: { href: "https://acme.com/", label: "acme.com" } });
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(within(screen.getByTestId("diagnosis-quotes-instagram")).queryByRole("link")).toBeNull();
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "ftp://acme.com/", "not a url"])("never links %s", (href) => {
    renderDoc(content(), { site: { href, label: "acme.com" }, instagram: { href, label: "@acme" } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(document.querySelector("a")).toBeNull();
    expect(document.querySelector("blockquote[cite]")).toBeNull();
    // The group titles and the quotes are still there.
    expect(screen.getByRole("heading", { name: copy.quotesFromSite })).toBeInTheDocument();
  });

  it("gives an origin that is neither site nor Instagram no title and no link, but still shows the quote", () => {
    const value = content({ sources: [{ origin: "user", quote: "palavras da pessoa", supports: "summary" } as unknown as DiagnosisContent["sources"][number]] });
    renderDoc(value, { site: { href: "https://acme.com/", label: "acme.com" }, user: { href: "https://evil.example/", label: "evil" } } as DiagnosisSourceLinks);
    const group = screen.getByTestId("diagnosis-quotes-user");
    expect(within(group).queryByRole("heading")).toBeNull();
    expect(within(group).queryByRole("link")).toBeNull();
    expect(group).toHaveTextContent("“palavras da pessoa”");
    expect(screen.queryByRole("heading", { name: copy.quotesFromSite })).not.toBeInTheDocument();
    expect(group.querySelector("blockquote")).not.toHaveAttribute("cite");
  });

  it("speaks English with the English messages", () => {
    const enCopy = en.assistant.equipe.diagnosis;
    renderDoc(content(), { site: { href: "https://acme.com/", label: "acme.com" } }, "en");
    expect(screen.getByRole("heading", { name: enCopy.documentSources })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: enCopy.quotesFromSite })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: enCopy.quotesFromInstagram })).toBeInTheDocument();
    expect(screen.getByText(enCopy.quotesNote)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: enCopy.quoteLink.replace("{name}", "acme.com") })).toBeInTheDocument();
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
    expect(item.querySelector("footer")?.textContent).toBe("foo");
    expect(item).not.toHaveTextContent("Oportunidade 1");
  });

  it("still numbers recognized opportunity supports", () => {
    renderDoc(content({ sources: [{ origin: "site", quote: "trecho de teste", supports: "opportunity:3" }] }));
    expect(section(copy.documentSources).getAllByRole("listitem")[0]).toHaveTextContent("Oportunidade 3");
  });
});
