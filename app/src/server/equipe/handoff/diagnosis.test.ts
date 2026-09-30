// Free diagnosis, pure part (ticket 08): what may reach the Pesquisa model and how
// its answer becomes a verified document. No I/O, no model.

import { describe, expect, it } from "vitest";
import type { HandoffDecisions, HandoffItem, HandoffOrigin, HandoffState } from "../domain/handoff";
import { INSTAGRAM_BIO, INSTAGRAM_CAPTIONS, SITE_TEXT } from "../module/testing/diagnosis";
import {
  DIAGNOSIS_LIMITS, diagnosisContentSchema, type DiagnosisModelOutput, type DiagnosisSource,
} from "./diagnosis-contract";
import {
  assembleDiagnosis, buildDiagnosisInput, canonicalizeWithMap, cleanPublicText, diagnosisCardPayload, diagnosisFailureCardPayload,
  diagnosisInformed, diagnosisInputSources, diagnosisSourceTexts, hasEnoughPublicText, normalizeForMatch,
} from "./diagnosis";

let seq = 0;
const item = (value: string, origin: HandoffOrigin, extra: Partial<HandoffItem> = {}): HandoffItem => ({ id: `i-${++seq}`, value, origin, ...extra });

type Options = {
  site?: string | null;
  instagram?: { bio: string; captions: string[] } | null;
  confirmInstagram?: boolean;
  name?: HandoffItem | null;
  colors?: HandoffItem[];
  fonts?: HandoffItem[];
  hostile?: boolean;
};

function handoffState(options: Options = {}): Pick<HandoffState, "captured" | "decisions"> {
  const site = options.site === undefined ? SITE_TEXT : options.site;
  const instagram = options.instagram === undefined ? { bio: INSTAGRAM_BIO, captions: INSTAGRAM_CAPTIONS } : options.instagram;
  const hostile = options.hostile ? "SEGREDO-DO-USUARIO" : "";
  const decisions: HandoffDecisions = {
    identity: {
      name: options.name === undefined ? item("Café Aurora", "site") : (options.name ?? item("Marca da Ana", "user")),
      logo: null,
      colors: options.colors ?? [item("#6F4E37", "site"), ...(hostile ? [item("#010203", "user")] : [])],
      fonts: options.fonts ?? [item("Inter", "site"), ...(hostile ? [item("Fonte-Secreta", "user")] : [])],
      paletteChoice: "site",
    },
    networks: options.confirmInstagram === false ? [] : [item("cafeaurora", "site", { platform: "instagram" })],
    images: { kept: [], removed: [], uploaded: [] },
  };
  return {
    decisions,
    captured: {
      publicContent: [
        ...(site ? [item(site, "site")] : []),
        ...(instagram ? [item(instagram.bio, "instagram")] : []),
        ...(hostile ? [item(`${hostile} texto digitado`, "user")] : []),
      ],
      images: [
        ...(instagram ? instagram.captions.map(caption => item("https://cdn.example/p.jpg", "instagram", { caption, key: `k/${++seq}` })) : []),
        ...(hostile ? [item("upload.png", "user", { caption: `${hostile} legenda do upload`, key: "k/up" })] : []),
      ],
    },
  };
}

const input = (options: Options = {}) => buildDiagnosisInput(handoffState(options));
const META = { readingId: "reading-1", taskIntentId: "intent-1", model: "muse-spark-1.3-contributor", promptVersion: "equipe-diagnosis/v1" };
const SITE_QUOTE = "Torramos café especial de origem única";
const SITE_QUOTE_2 = "A assinatura entrega dois pacotes de 250 g na sua porta";
const IG_QUOTE = "Receita de cold brew com o lote Fazenda Boa Vista";
const ev = (source: DiagnosisSource, quote: string) => ({ source, quote });
const output = (partial: Partial<DiagnosisModelOutput> = {}): DiagnosisModelOutput => ({
  summary: { text: "Torrefação especial em Campinas.", evidence: [ev("site", SITE_QUOTE)] },
  channels: [{ source: "site", message: "origem, produto e assinatura", evidence: [ev("site", SITE_QUOTE_2)] }],
  opportunities: [{ title: "Mostrar a origem de cada lote", evidence: [ev("site", SITE_QUOTE)] }],
  notFound: ["público-alvo"],
  ...partial,
});
const assemble = (out: DiagnosisModelOutput | null, options: Options = {}) =>
  assembleDiagnosis({ input: input(options), output: out, brand: "Café Aurora", meta: META });

describe("buildDiagnosisInput — only public fields reach the Pesquisa model", () => {
  it("never carries origin=user data, typed addresses or uploads (hostile fixture)", () => {
    const built = input({ hostile: true, name: null });
    const json = JSON.stringify(built);
    expect(json).not.toContain("SEGREDO-DO-USUARIO");
    expect(json).not.toContain("#010203");
    expect(json).not.toContain("Fonte-Secreta");
    expect(json).not.toContain("Marca da Ana");
    expect(json).not.toContain("cafeaurora.example");
    expect(json).not.toContain("upload.png");
    // public fields of the same handoff are still there
    expect(built.colors).toEqual([{ origin: "site", value: "#6F4E37" }]);
    expect(built.fonts).toEqual([{ origin: "site", value: "Inter" }]);
    expect(built.site?.text).toContain("Café Aurora");
  });

  it("a name whose origin is user becomes null; a public name is kept", () => {
    expect(input({ name: null }).name).toBeNull();
    expect(input().name).toBe("Café Aurora");
  });

  it("ignores Instagram that the person did not confirm, even with captured data", () => {
    const built = input({ confirmInstagram: false });
    expect(built.instagram).toBeNull();
    expect(JSON.stringify(built)).not.toContain("cold brew");
    expect(diagnosisInputSources(built)).toEqual(["site"]);
  });

  it("supports a single source: site only and Instagram only", () => {
    const siteOnly = input({ instagram: null });
    expect(siteOnly.instagram).toBeNull();
    expect(siteOnly.site).not.toBeNull();
    expect(diagnosisInputSources(siteOnly)).toEqual(["site"]);
    const instagramOnly = input({ site: null });
    expect(instagramOnly.site).toBeNull();
    expect(instagramOnly.instagram?.bio).toBe(INSTAGRAM_BIO);
    expect(instagramOnly.instagram?.posts).toEqual(INSTAGRAM_CAPTIONS);
    expect(diagnosisInputSources(instagramOnly)).toEqual(["instagram"]);
    expect(diagnosisInputSources(input())).toEqual(["site", "instagram"]);
  });

  it("clamps colors to 20 and fonts to 100 characters so a huge scraped value cannot fail the strict schema", async () => {
    const { diagnosisInputSchema } = await import("./diagnosis-contract");
    const built = input({ colors: [item(`#${"a".repeat(60)}`, "site")], fonts: [item("F".repeat(400), "instagram")] });
    expect(built.colors[0]!.value).toHaveLength(20);
    expect(built.fonts[0]!.value).toHaveLength(100);
    expect(diagnosisInputSchema.safeParse(built).success).toBe(true);
    expect(input({ colors: Array.from({ length: 20 }, () => item("#112233", "site")) }).colors).toHaveLength(12);
  });

  it("cuts to the limits: 20000 site chars, bio 1000, 12 captions of 600", () => {
    const built = input({
      site: "a".repeat(30_000),
      instagram: { bio: "b".repeat(3_000), captions: Array.from({ length: 20 }, () => "c".repeat(900)) },
    });
    expect(built.site!.text).toHaveLength(DIAGNOSIS_LIMITS.siteChars);
    expect(built.instagram!.bio).toHaveLength(DIAGNOSIS_LIMITS.instagramBioChars);
    expect(built.instagram!.posts).toHaveLength(DIAGNOSIS_LIMITS.instagramPosts);
    for (const post of built.instagram!.posts) expect(post.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.instagramCaptionChars);
  });

  it("drops markdown noise (images, link targets, rules, tags) and keeps the words", () => {
    const built = input({ site: "# Título\n\n![logo](https://x.example/logo.png)\n\n[Nossa loja](https://x.example/loja)\n\n---\n\n<div class=\"a\">Texto visível</div>" });
    const text = built.site!.text;
    expect(text).toContain("Nossa loja");
    expect(text).toContain("Texto visível");
    expect(text).not.toContain("x.example");
    expect(text).not.toContain("---");
    expect(text).not.toContain("<div");
    expect(cleanPublicText("a\n\n\n\n\nb")).toBe("a\n\nb");
  });

  it("skips Instagram captions that are blank", () => {
    const built = input({ instagram: { bio: INSTAGRAM_BIO, captions: ["   ", "Legenda real do post"] } });
    expect(built.instagram!.posts).toEqual(["Legenda real do post"]);
  });

  it("output always satisfies the strict input schema used by the runner", async () => {
    const { diagnosisInputSchema } = await import("./diagnosis-contract");
    expect(diagnosisInputSchema.safeParse(input()).success).toBe(true);
    expect(diagnosisInputSchema.safeParse(input({ hostile: true })).success).toBe(true);
    expect(diagnosisInputSchema.safeParse({ ...input(), history: [] }).success).toBe(false);
  });
});

describe("hasEnoughPublicText", () => {
  it("needs at least 200 characters of public text; identity signals do not count", () => {
    expect(hasEnoughPublicText(input({ site: "a".repeat(199), instagram: null }))).toBe(false);
    expect(hasEnoughPublicText(input({ site: "a".repeat(200), instagram: null }))).toBe(true);
    // bio + captions add up across sources
    expect(hasEnoughPublicText(input({ site: "a".repeat(100), instagram: { bio: "b".repeat(50), captions: ["c".repeat(50)] } }))).toBe(true);
    expect(hasEnoughPublicText(input({ site: null, instagram: null }))).toBe(false);
  });
});

describe("diagnosisSourceTexts", () => {
  it("puts confirmed colors/fonts only in the source they were read from", () => {
    const built = input({
      colors: [item("#6F4E37", "site"), item("#111111", "instagram")],
      fonts: [item("Inter", "site")],
    });
    const texts = diagnosisSourceTexts(built);
    expect(texts.site).toContain("Cores confirmadas: #6F4E37");
    expect(texts.site).toContain("Fontes confirmadas: Inter");
    expect(texts.site).not.toContain("#111111");
    expect(texts.instagram).toContain("Cores confirmadas: #111111");
    expect(texts.instagram).not.toContain("#6F4E37");
    expect(texts.instagram).not.toContain("Inter");
  });

  it("numbers Instagram captions and only returns the sources that exist", () => {
    const texts = diagnosisSourceTexts(input());
    expect(texts.instagram).toContain(`Bio: ${INSTAGRAM_BIO}`);
    expect(texts.instagram).toContain(`Legenda 1: ${INSTAGRAM_CAPTIONS[0]}`);
    expect(texts.instagram).toContain(`Legenda 3: ${INSTAGRAM_CAPTIONS[2]}`);
    expect(Object.keys(diagnosisSourceTexts(input({ instagram: null })))).toEqual(["site"]);
    expect(Object.keys(diagnosisSourceTexts(input({ site: null })))).toEqual(["instagram"]);
  });
});

describe("normalizeForMatch", () => {
  it("ignores case, punctuation, markdown, emoji and spacing", () => {
    expect(normalizeForMatch("**Café   Especial!**  ☕")).toBe("café especial");
    expect(normalizeForMatch("Receita — cold-brew, 14h (geladeira) 😀")).toBe(normalizeForMatch("receita cold brew 14h geladeira"));
    expect(normalizeForMatch("  # Título\n\n> citação  ")).toBe("título citação");
  });

  it("keeps different words different", () => {
    expect(normalizeForMatch("café especial")).not.toBe(normalizeForMatch("café comum"));
  });
});

describe("assembleDiagnosis", () => {
  it("keeps a verified excerpt and stores it with the claim it backs", () => {
    const content = assemble(output());
    expect(content.status).toBe("complete");
    expect(content.brand).toBe("Café Aurora");
    expect(content.summary).toBe("Torrefação especial em Campinas.");
    expect(content.opportunities).toEqual([{ title: "Mostrar a origem de cada lote", sources: ["site"] }]);
    expect(content.channels).toEqual([{ name: "Site", source: "site", message: "origem, produto e assinatura" }]);
    expect(content.sources).toEqual(expect.arrayContaining([
      { origin: "site", quote: SITE_QUOTE, supports: "opportunity:1" },
      { origin: "site", quote: SITE_QUOTE_2, supports: "channel:site" },
      { origin: "site", quote: SITE_QUOTE, supports: "summary" },
    ]));
    expect(content.meta).toMatchObject({ ...META, inputSources: ["site", "instagram"] });
    expect(diagnosisContentSchema.safeParse(content).success).toBe(true);
  });

  it("matches a quote that differs only by case, markdown marks, typographic quotes/dashes or edge punctuation", () => {
    const content = assemble(output({ opportunities: [{ title: "Contar a origem", evidence: [ev("site", "**TORRAMOS CAFÉ ESPECIAL** de origem única!")] }] }));
    expect(content.status).toBe("complete");
    expect(content.opportunities).toHaveLength(1);
  });

  it("accepts Instagram evidence and records both sources on a shared opportunity", () => {
    const content = assemble(output({ opportunities: [{ title: "Repetir a receita do cold brew", evidence: [ev("site", SITE_QUOTE), ev("instagram", IG_QUOTE)] }] }));
    expect(content.opportunities[0]!.sources).toEqual(["site", "instagram"]);
  });

  it("drops an invented excerpt, and an opportunity left without any excerpt", () => {
    const content = assemble(output({ opportunities: [
      { title: "Inventada", evidence: [ev("site", "Fazemos a melhor pizza da cidade desde 1990")] },
      { title: "Verdadeira", evidence: [ev("site", SITE_QUOTE), ev("site", "Frase que não existe em lugar nenhum do site")] },
    ] }));
    expect(content.opportunities.map(o => o.title)).toEqual(["Verdadeira"]);
    expect(content.sources.map(s => s.quote)).not.toContain("Frase que não existe em lugar nenhum do site");
  });

  it("drops an excerpt attributed to the wrong source", () => {
    // the quote exists in the site text, not in the Instagram text
    const wrong = assemble(output({ opportunities: [{ title: "Errada", evidence: [ev("instagram", SITE_QUOTE)] }] }));
    expect(wrong.status).toBe("insufficient");
    // and to a source that was not even available
    const unavailable = assemble(output({ opportunities: [{ title: "Indisponível", evidence: [ev("instagram", IG_QUOTE)] }] }), { instagram: null });
    expect(unavailable.status).toBe("insufficient");
    // even when the excerpt does exist in ANOTHER available source, naming a source that was not read is not evidence
    const borrowed = assemble(output({ opportunities: [{ title: "Emprestada", evidence: [ev("instagram", SITE_QUOTE)] }] }), { instagram: null });
    expect(borrowed.status).toBe("insufficient");
  });

  it("drops an opportunity with no excerpt at all", () => {
    expect(assemble(output({ opportunities: [{ title: "Sem trecho", evidence: [] }] })).status).toBe("insufficient");
  });

  it("ignores excerpts that are too short or too long to be evidence", () => {
    expect(assemble(output({ opportunities: [{ title: "Curta", evidence: [ev("site", "café")] }] })).status).toBe("insufficient");
    expect(assemble(output({ opportunities: [{ title: "Longa", evidence: [ev("site", SITE_TEXT)] }] })).status).toBe("insufficient");
  });

  it("keeps at most 3 opportunities and 3 excerpts per item", () => {
    const valid = (n: number) => ({ title: `Oportunidade ${n}`, evidence: [ev("site", SITE_QUOTE)] });
    const content = assemble(output({ opportunities: [1, 2, 3, 4, 5].map(valid) }));
    expect(content.opportunities.map(o => o.title)).toEqual(["Oportunidade 1", "Oportunidade 2", "Oportunidade 3"]);
    const many = assemble(output({ opportunities: [{ title: "Muitas", evidence: [
      ev("site", SITE_QUOTE), ev("site", SITE_QUOTE_2), ev("site", "Vendemos café em grãos, moído e por assinatura mensal"), ev("site", "Cada lote tem ficha com fazenda, altitude e nota de torra"),
    ] }] }));
    expect(many.sources.filter(s => s.supports === "opportunity:1")).toHaveLength(DIAGNOSIS_LIMITS.evidencePerItem);
  });

  it("catches the plural 'rivais' like the singular", () => {
    const content = assemble(output({ opportunities: [
      { title: "Superar os rivais", evidence: [ev("site", SITE_QUOTE)] },
      { title: "Vencer o Rival local", evidence: [ev("site", SITE_QUOTE)] },
      { title: "Contar a origem dos lotes", evidence: [ev("site", SITE_QUOTE)] },
    ] }));
    expect(content.opportunities.map(o => o.title)).toEqual(["Contar a origem dos lotes"]);
  });

  it("keeps an opportunity title only once, ignoring case and punctuation", () => {
    const content = assemble(output({ opportunities: [
      { title: "Mostrar a origem de cada lote", evidence: [ev("site", SITE_QUOTE)] },
      { title: "  mostrar a ORIGEM de cada lote! ", evidence: [ev("site", SITE_QUOTE_2)] },
      { title: "Explicar a assinatura", evidence: [ev("site", SITE_QUOTE_2)] },
    ] }));
    expect(content.opportunities.map(o => o.title)).toEqual(["Mostrar a origem de cada lote", "Explicar a assinatura"]);
    // the dropped duplicate leaves no backing excerpt behind and numbering stays contiguous
    expect(content.sources.filter(s => s.supports.startsWith("opportunity:")).map(s => s.supports)).toEqual(["opportunity:1", "opportunity:2"]);
  });

  it("does not repeat the same excerpt inside one item", () => {
    const content = assemble(output({ opportunities: [{ title: "Repetida", evidence: [ev("site", SITE_QUOTE), ev("site", SITE_QUOTE.toUpperCase())] }] }));
    expect(content.sources.filter(s => s.supports === "opportunity:1")).toHaveLength(1);
  });

  it("drops anything that talks about competitors, in any field", () => {
    const content = assemble(output({
      summary: { text: "Melhor que os concorrentes da região.", evidence: [ev("site", SITE_QUOTE)] },
      channels: [{ source: "site", message: "comparação com o rival", evidence: [ev("site", SITE_QUOTE_2)] }],
      opportunities: [
        { title: "Superar a concorrência", evidence: [ev("site", SITE_QUOTE)] },
        { title: "Vencer os Competidores locais", evidence: [ev("site", SITE_QUOTE)] },
        { title: "Contar a origem dos lotes", evidence: [ev("site", SITE_QUOTE)] },
      ],
      notFound: ["preço dos concorrentes", "público-alvo", "Competitor pricing"],
    }));
    expect(content.opportunities.map(o => o.title)).toEqual(["Contar a origem dos lotes"]);
    expect(content.channels).toEqual([]);
    expect(content.summary).toBe("Li o que está público sobre Café Aurora e encontrei 1 oportunidade com fonte.");
    expect(content.notFound).toContain("público-alvo");
    expect(content.notFound.join(" ").toLowerCase()).not.toMatch(/concorr|competitor/);
    expect(JSON.stringify(content).toLowerCase()).not.toMatch(/concorr|competidor|rival/);
  });

  it("drops a channel for a source that was not available", () => {
    const content = assemble(output({ channels: [
      { source: "instagram", message: "bastidores e receitas", evidence: [ev("instagram", IG_QUOTE)] },
      { source: "site", message: "origem e assinatura", evidence: [ev("site", SITE_QUOTE_2)] },
    ] }), { instagram: null });
    expect(content.channels.map(c => c.source)).toEqual(["site"]);
  });

  it("keeps one channel per source and requires evidence from the channel's own source", () => {
    const content = assemble(output({ channels: [
      { source: "site", message: "primeira", evidence: [ev("site", SITE_QUOTE_2)] },
      { source: "site", message: "repetida", evidence: [ev("site", SITE_QUOTE_2)] },
      { source: "instagram", message: "evidência do site", evidence: [ev("site", SITE_QUOTE)] },
    ] }));
    expect(content.channels).toEqual([{ name: "Site", source: "site", message: "primeira" }]);
  });

  it("tells what was not read: Instagram not confirmed (site only) or Site not informed (Instagram only)", () => {
    const siteOnly = assemble(output({ notFound: [] }), { instagram: null });
    expect(siteOnly.notFound).toContain("Instagram (não confirmado)");
    expect(siteOnly.notFound).not.toContain("Site (não informado)");
    expect(siteOnly.meta.inputSources).toEqual(["site"]);

    const instagramOnly = assemble(output({
      summary: { text: "Bastidores e receitas.", evidence: [ev("instagram", IG_QUOTE)] },
      channels: [{ source: "instagram", message: "receitas e bastidores", evidence: [ev("instagram", IG_QUOTE)] }],
      opportunities: [{ title: "Transformar a receita em série", evidence: [ev("instagram", IG_QUOTE)] }], notFound: [],
    }), { site: null });
    expect(instagramOnly.notFound).toContain("Site (não informado)");
    expect(instagramOnly.notFound).not.toContain("Instagram (não confirmado)");
    expect(instagramOnly.status).toBe("complete");
    expect(instagramOnly.opportunities[0]!.sources).toEqual(["instagram"]);

    const both = assemble(output({ notFound: [] }));
    expect(both.notFound).toEqual([]);
  });

  it("replaces an unverified summary with the fixed sentence", () => {
    const noEvidence = assemble(output({ summary: { text: "Uma marca incrível.", evidence: [] } }));
    expect(noEvidence.summary).toBe("Li o que está público sobre Café Aurora e encontrei 1 oportunidade com fonte.");
    const invented = assemble(output({ summary: { text: "Uma marca incrível.", evidence: [ev("site", "Texto que o site nunca disse em parte alguma")] } }));
    expect(invented.summary).toBe(noEvidence.summary);
    expect(invented.sources.some(s => s.supports === "summary")).toBe(false);
    const two = assemble(output({
      summary: { text: "x", evidence: [] },
      opportunities: [{ title: "Um", evidence: [ev("site", SITE_QUOTE)] }, { title: "Dois", evidence: [ev("site", SITE_QUOTE)] }],
    }));
    expect(two.summary).toContain("2 oportunidades com fonte");
    expect(assembleDiagnosis({ input: input(), output: output({ summary: { text: "", evidence: [] } }), brand: null, meta: META }).summary)
      .toBe("Li o que está público da sua marca e encontrei 1 oportunidade com fonte.");
  });

  it("no verified opportunity → an honest 'insufficient' document, never a failure", () => {
    const content = assemble(output({ opportunities: [{ title: "Inventada", evidence: [ev("site", "Texto que o site nunca disse em parte alguma")] }], notFound: ["público-alvo"] }));
    expect(content.status).toBe("insufficient");
    expect(content.opportunities).toEqual([]);
    expect(content.sources).toEqual([]);
    expect(content.summary).toContain("Nada foi inventado");
    expect(content.summary).toContain("Café Aurora");
    expect(content.channels.map(c => c.source)).toEqual(["site", "instagram"]);
    expect(content.channels.every(c => c.message.includes("sem trecho que sustente"))).toBe(true);
    expect(content.notFound).toContain("oportunidades com fonte");
    expect(content.notFound).toContain("público-alvo");
    expect(content.meta.inputSources).toEqual(["site", "instagram"]);
    expect(diagnosisContentSchema.safeParse(content).success).toBe(true);
  });

  it("no model output + too little public text → insufficient, told as too short", () => {
    const short = input({ site: "Café Aurora. Torra própria.", instagram: null });
    expect(hasEnoughPublicText(short)).toBe(false);
    const content = assembleDiagnosis({ input: short, output: null, brand: "Café Aurora", meta: { ...META, model: null, promptVersion: null } });
    expect(content.status).toBe("insufficient");
    expect(content.channels).toEqual([{ name: "Site", source: "site", message: "texto público curto demais para analisar" }]);
    expect(content.notFound).toEqual(expect.arrayContaining(["Instagram (não confirmado)", "oportunidades com fonte"]));
    expect(content.opportunities).toEqual([]);
    expect(content.meta.model).toBeNull();
  });

  it("a model answer is ignored when the public text is too short (nothing to verify against)", () => {
    const short = input({ site: SITE_QUOTE, instagram: null });
    const content = assembleDiagnosis({ input: short, output: output(), brand: null, meta: META });
    expect(content.status).toBe("insufficient");
    expect(content.summary).toContain("da sua marca");
  });

  it("enforces the size caps: title 120, channel 90, summary 480, notFound 6 × 80", () => {
    const content = assemble(output({
      summary: { text: "s".repeat(1_000), evidence: [ev("site", SITE_QUOTE)] },
      channels: [{ source: "site", message: "c".repeat(300), evidence: [ev("site", SITE_QUOTE_2)] }],
      opportunities: [{ title: "t".repeat(400), evidence: [ev("site", SITE_QUOTE)] }],
      notFound: Array.from({ length: 10 }, (_, index) => `${index}-${"n".repeat(200)}`),
    }));
    expect(content.opportunities[0]!.title.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.opportunityChars);
    expect(content.channels[0]!.message.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.channelChars);
    expect(content.summary.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.summaryChars);
    expect(content.notFound.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.notFoundItems);
    for (const text of content.notFound) expect(text.length).toBeLessThanOrEqual(DIAGNOSIS_LIMITS.notFoundChars);
  });

  it("dedupes notFound ignoring case and keeps the leading 'not read' entries first", () => {
    const content = assemble(output({ notFound: ["Público-alvo", "público-alvo", " "] }), { instagram: null });
    expect(content.notFound).toEqual(["Instagram (não confirmado)", "Público-alvo"]);
  });

  it("never stores user-origin text: the hostile fixture leaves no trace in the document", () => {
    const content = assemble(output(), { hostile: true, name: null });
    expect(JSON.stringify(content)).not.toContain("SEGREDO-DO-USUARIO");
  });

  it("a quote of the hostile user text cannot be verified (origin=user is not a source)", () => {
    const content = assemble(output({ opportunities: [{ title: "Do usuário", evidence: [ev("site", "SEGREDO-DO-USUARIO texto digitado")] }] }), { hostile: true });
    expect(content.status).toBe("insufficient");
  });

  it("a confirmed identity signal is quotable evidence of its own source only", () => {
    const fromSite = assemble(output({ opportunities: [{ title: "Usar a fonte da marca", evidence: [ev("site", "Fontes confirmadas: Inter")] }] }));
    expect(fromSite.status).toBe("complete");
    const fromInstagram = assemble(output({ opportunities: [{ title: "Errada", evidence: [ev("instagram", "Fontes confirmadas: Inter")] }] }));
    expect(fromInstagram.status).toBe("insufficient");
  });
});

describe("assembleDiagnosis — literal evidence", () => {
  const FILLER = " O ateliê funciona de segunda a sexta e atende encomendas por mensagem, com prazo combinado de acordo com o tamanho do pedido de cada cliente, sempre com aviso antes da entrega e retirada no local sem custo adicional.";
  const site = (text: string) => `${text}${FILLER}`;
  const verifies = (source: string, quote: string) => {
    const content = assembleDiagnosis({
      input: input({ site: site(source), instagram: null }), brand: null, meta: META,
      output: output({ opportunities: [{ title: "Mostrar o preço", evidence: [ev("site", quote)] }], summary: { text: "x", evidence: [] }, channels: [] }),
    });
    return content;
  };

  it("does not verify a different symbol or number punctuation: 'A + B' ≠ 'A - B', 'R$ 49,90' ≠ 'R$ 49.90'", () => {
    expect(verifies("Combo de café + bolo por tempo limitado", "Combo de café - bolo por tempo limitado").status).toBe("insufficient");
    expect(verifies("Combo de café + bolo por tempo limitado", "Combo de café + bolo por tempo limitado").status).toBe("complete");
    expect(verifies("Assinatura mensal por R$ 49,90 com frete", "Assinatura mensal por R$ 49.90 com frete").status).toBe("insufficient");
    expect(verifies("Assinatura mensal por R$ 49,90 com frete", "Assinatura mensal por R$ 49,90 com frete").status).toBe("complete");
    expect(verifies("Desconto de 10% na primeira compra", "Desconto de 10 na primeira compra").status).toBe("insufficient");
    expect(verifies("Pague 2 e leve 3 nesta semana toda", "Pague 2, e leve 3 nesta semana toda").status).toBe("insufficient");
  });

  it("stores the SOURCE's wording, not the model's spelling (case kept, markdown marks gone)", () => {
    const content = verifies("Torramos **Café Especial** de Origem Única em Campinas", "torramos café especial de origem única");
    expect(content.status).toBe("complete");
    expect(content.sources.map(item => item.quote)).toEqual(["Torramos Café Especial de Origem Única"]);
  });

  it("stores the source's wording for line breaks and inline code too", () => {
    const content = verifies("Torramos café\nespecial de `origem` única em Campinas", "Torramos café especial de origem única");
    expect(content.sources[0]!.quote).toBe("Torramos café especial de origem única");
  });

  it("tolerates curly quotes, long dashes and edge punctuation", () => {
    expect(verifies('Nosso lema é "café bom, sem pressa" para todos', "Nosso lema é “café bom, sem pressa” para todos").status).toBe("complete");
    expect(verifies("Aberto de segunda - sexta, das 8h às 18h sempre", "Aberto de segunda — sexta, das 8h às 18h sempre").status).toBe("complete");
    expect(verifies("Entrega rápida para toda a cidade de Campinas", "«Entrega rápida para toda a cidade de Campinas».").status).toBe("complete");
    expect(verifies("Entrega rápida para toda a cidade de Campinas", "  ...Entrega rápida para toda a cidade de Campinas!!! ").status).toBe("complete");
  });

  it("does not tolerate different INNER punctuation", () => {
    expect(verifies("Entrega rápida, segura e para toda a cidade", "Entrega rápida segura e para toda a cidade").status).toBe("insufficient");
    expect(verifies("Entrega rápida e segura para toda a cidade", "Entrega rápida; e segura para toda a cidade").status).toBe("insufficient");
  });

  it("drops an excerpt that mentions competitors, and the opportunity falls when it was the only support", () => {
    const source = "Somos melhores que os concorrentes da região em qualidade";
    const only = verifies(source, source);
    expect(only.status).toBe("insufficient");
    expect(only.opportunities).toEqual([]);
    const two = assemble(output({ opportunities: [{ title: "Duas provas", evidence: [ev("site", SITE_QUOTE), ev("site", "Vendemos café em grãos, moído e por assinatura mensal")] }] }));
    expect(two.opportunities).toHaveLength(1);
    const mixed = assembleDiagnosis({
      input: input({ site: site("Torramos café especial de origem única. Melhor que a concorrência em todo o bairro de Campinas."), instagram: null }), brand: null, meta: META,
      output: output({ summary: { text: "x", evidence: [] }, channels: [], opportunities: [{ title: "Mostrar a origem", evidence: [ev("site", "Melhor que a concorrência em todo o bairro de Campinas"), ev("site", SITE_QUOTE)] }] }),
    });
    expect(mixed.opportunities).toHaveLength(1);
    expect(mixed.sources.map(item => item.quote)).toEqual([SITE_QUOTE]);
    expect(JSON.stringify(mixed).toLowerCase()).not.toContain("concorr");
  });

  it("canonicalizeWithMap keeps map.length === norm.length, astral characters included", () => {
    for (const text of ["Café ☕ **Aurora**  —  “ok”", "😀 torra 😀 própria", "a\n\n b", "𝒜𝒷 coffee", "  "]) {
      const { norm, map } = canonicalizeWithMap(text);
      expect(map).toHaveLength(norm.length);
      for (const at of map) expect(at).toBeLessThan(text.length);
    }
    const { norm, map } = canonicalizeWithMap("😀 Torra");
    expect(norm).toBe("😀 torra");
    expect(map[0]).toBe(0);
    expect(map.at(-1)).toBe("😀 Torra".length - 1);
  });

  it("canonicalizeWithMap ignores only case, whitespace, markdown marks and typographic variants", () => {
    expect(canonicalizeWithMap("**A**  “B” — C").norm).toBe('a "b" - c');
    expect(canonicalizeWithMap("a + b").norm).toBe("a + b");
    expect(canonicalizeWithMap("R$ 49,90").norm).toBe("r$ 49,90");
  });
});

describe("assembleDiagnosis — informed sources that yielded no text", () => {
  const informedBoth = { site: true, instagram: true };

  it("says 'sem texto público' for an informed source that gave no text, and keeps the old wording otherwise", () => {
    const siteOnly = assembleDiagnosis({ input: input({ instagram: null }), output: output({ notFound: [] }), brand: null, meta: META, informed: informedBoth });
    expect(siteOnly.notFound).toContain("Instagram (sem texto público)");
    expect(siteOnly.notFound).not.toContain("Instagram (não confirmado)");
    const notInformed = assembleDiagnosis({ input: input({ instagram: null }), output: output({ notFound: [] }), brand: null, meta: META, informed: { site: true, instagram: false } });
    expect(notInformed.notFound).toContain("Instagram (não confirmado)");
    const withoutInformed = assembleDiagnosis({ input: input({ instagram: null }), output: output({ notFound: [] }), brand: null, meta: META });
    expect(withoutInformed.notFound).toContain("Instagram (não confirmado)");
    const igOnly = assembleDiagnosis({
      input: input({ site: null }), brand: null, meta: META, informed: informedBoth,
      output: output({ summary: { text: "x", evidence: [] }, channels: [], opportunities: [{ title: "Receita em série", evidence: [ev("instagram", IG_QUOTE)] }], notFound: [] }),
    });
    expect(igOnly.notFound).toContain("Site (sem texto público)");
    expect(igOnly.notFound).not.toContain("Site (não informado)");
  });

  it("also applies to the insufficient document", () => {
    const content = assembleDiagnosis({ input: input({ instagram: null }), output: null, brand: null, meta: META, informed: informedBoth });
    expect(content.notFound).toEqual(expect.arrayContaining(["Instagram (sem texto público)", "oportunidades com fonte"]));
  });

  it("diagnosisInformed: a site source, or a confirmed Instagram network", () => {
    const base = handoffState();
    expect(diagnosisInformed({ source: { kind: "site", value: "https://x.com", normalized: "https://x.com/" }, decisions: base.decisions })).toEqual({ site: true, instagram: true });
    expect(diagnosisInformed({ source: { kind: "instagram", value: "@x", normalized: "x" }, decisions: { ...base.decisions, networks: [] } })).toEqual({ site: false, instagram: false });
    expect(diagnosisInformed({ source: null, decisions: {} })).toEqual({ site: false, instagram: false });
  });
});

describe("card payloads", () => {
  const accountId = "00000000-0000-4000-8000-000000000001";
  const documentId = "00000000-0000-4000-8000-000000000002";

  it("ready card copies the document and offers the ready iscas", () => {
    const content = assemble(output());
    const card = diagnosisCardPayload({ accountId, documentId, content, readsUsed: 1 });
    expect(card).toMatchObject({ kind: "diagnosis", status: "ready", documentId, brand: "Café Aurora", summary: content.summary });
    expect(card.suggestions).toContain("Me explica a oportunidade");
    expect(card.suggestions).toContain("Montar o calendário do mês");
  });

  it("insufficient card offers 'Corrigir…' only while a reading is left", () => {
    const content = assemble(output({ opportunities: [] }));
    expect(content.status).toBe("insufficient");
    expect(diagnosisCardPayload({ accountId, documentId, content, readsUsed: 1 }).suggestions).toContain("Corrigir ou acrescentar meu site ou @");
    expect(diagnosisCardPayload({ accountId, documentId, content, readsUsed: 2 }).suggestions).toContain("Corrigir ou acrescentar meu site ou @");
    expect(diagnosisCardPayload({ accountId, documentId, content, readsUsed: 3 }).suggestions).not.toContain("Corrigir ou acrescentar meu site ou @");
    expect(diagnosisCardPayload({ accountId, documentId, content, readsUsed: 1 })).toMatchObject({ status: "insufficient" });
  });

  it("failed card offers 'Tentar de novo' only when retryable", () => {
    expect(diagnosisFailureCardPayload({ accountId, code: "provider_error", retryable: true })).toMatchObject({ kind: "diagnosis", status: "failed", failureCode: "provider_error", suggestions: ["Tentar de novo"] });
    expect(diagnosisFailureCardPayload({ accountId, code: "budget_exceeded", retryable: false }).suggestions).toEqual([]);
  });
});
