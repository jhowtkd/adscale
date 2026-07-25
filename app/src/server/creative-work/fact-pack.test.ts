import { describe, expect, it } from "vitest";
import type { ContentBrief } from "@/server/ai/image-analysis";
import type { CreativeWorkFactPack } from "./contracts";
import {
  buildCreativeWorkFactPack,
  validateSocialPostCopyAgainstFactPack,
  type CreativeWorkFactPackSourceInput,
} from "./fact-pack";

const PSICOLOGIA_REQUEST =
  "Post para o consultório de Psicologia: grupo de terapia começa em agosto, vagas limitadas, atendimento online";

function contentBrief(overrides: Partial<ContentBrief>): ContentBrief {
  return {
    product: "Produto",
    offer: "",
    cta: { text: "Saiba mais", style: "botão" },
    brandElements: [],
    keyVisual: "pessoa",
    textContent: { headline: "Headline", bullets: [] },
    format: "4:5",
    ...overrides,
  };
}

const twoContentSources: CreativeWorkFactPackSourceInput[] = [
  {
    sourceId: "source-content-1",
    usage: "content",
    content: contentBrief({
      product: "Grupo de terapia",
      offer: "Inscrições abertas",
      textContent: { headline: "Cuide da sua mente", bullets: ["Encontros semanais"] },
    }),
  },
  {
    sourceId: "source-content-2",
    usage: "both",
    content: contentBrief({ product: "Mentoria individual", offer: "Turma de agosto" }),
  },
];

const styleSourceWithForeignFacts: CreativeWorkFactPackSourceInput = {
  sourceId: "source-style",
  usage: "style",
  content: contentBrief({
    product: "Condomínio fechado",
    offer: "R$ 900.000 à vista",
    textContent: { headline: "Mude-se hoje", bullets: ["3 suítes"] },
    brandElements: ["Imobiliária Prime"],
  }),
};

describe("buildCreativeWorkFactPack", () => {
  it("keeps the full untruncated request and extracts request facts with provenance", () => {
    const longRequest = `${PSICOLOGIA_REQUEST}. ${"Detalhes da proposta com texto longo. ".repeat(12)}`;
    const pack = buildCreativeWorkFactPack({
      request: longRequest,
      mode: "art_variation",
      sources: [],
      brand: null,
      clientProfileId: "profile-1",
    });
    expect(pack.request).toBe(longRequest);
    expect(pack.request.length).toBeGreaterThan(240);
    expect(pack.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "agosto", class: "date", required: true, origin: "request" }),
      expect.objectContaining({ value: "vagas limitadas", class: "condition", required: true, origin: "request" }),
      expect.objectContaining({ value: "online", class: "modality", required: true, origin: "request" }),
    ]));
  });

  it("collects facts from every effective content|both source and never from a style-only source", () => {
    const pack = buildCreativeWorkFactPack({
      request: PSICOLOGIA_REQUEST,
      mode: "art_variation",
      sources: [...twoContentSources, styleSourceWithForeignFacts],
      brand: null,
      clientProfileId: "profile-1",
    });
    expect(pack.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "Grupo de terapia", class: "product", origin: "source", sourceId: "source-content-1" }),
      expect.objectContaining({ value: "Mentoria individual", class: "product", origin: "source", sourceId: "source-content-2" }),
      expect.objectContaining({ value: "Cuide da sua mente", class: "text", origin: "source", sourceId: "source-content-1" }),
    ]));
    const serialized = JSON.stringify(pack.facts);
    expect(serialized).not.toContain("Condomínio fechado");
    expect(serialized).not.toContain("R$ 900.000");
    expect(serialized).not.toContain("Imobiliária Prime");
    expect(serialized).not.toContain("source-style");
  });

  it("marks original-art facts and essential text as required only for format adaptation", () => {
    const build = (mode: "format_adaptation" | "art_variation") =>
      buildCreativeWorkFactPack({
        request: "Adapte esta peça",
        mode,
        sources: [twoContentSources[0]],
        brand: null,
        clientProfileId: "profile-1",
      });
    const adaptation = build("format_adaptation");
    expect(adaptation.facts.length).toBeGreaterThan(0);
    expect(adaptation.facts.every((fact) => fact.origin !== "source" || fact.required)).toBe(true);
    const variation = build("art_variation");
    expect(variation.facts.every((fact) => fact.origin !== "source" || !fact.required)).toBe(true);
    // Same factual contract shared by every output of the work.
    expect(variation.facts.map((fact) => fact.value)).toEqual(adaptation.facts.map((fact) => fact.value));
  });

  it("records brand identity, required and prohibited elements without placeholders", () => {
    const pack = buildCreativeWorkFactPack({
      request: PSICOLOGIA_REQUEST,
      mode: "social_post",
      sources: [],
      brand: { name: "Cenbrap", requiredElements: "Logo no rodapé;\nSelo CRP", prohibitedElements: "Clipart" },
      clientProfileId: "profile-1",
    });
    expect(pack.identity).toEqual({ clientProfileId: "profile-1", brandName: "Cenbrap", brandAuthority: "active" });
    expect(pack.facts).toContainEqual({ value: "Cenbrap", class: "brand", required: true, origin: "brand" });
    expect(pack.brand).toEqual({ requiredElements: ["Logo no rodapé", "Selo CRP"], prohibitedElements: ["Clipart"] });
    expect(JSON.stringify(pack)).not.toContain("Público da marca");
  });

  it("makes the art's explicit brand the required identity under a resolved source authority (R-003)", () => {
    const pack = buildCreativeWorkFactPack({
      request: "Reestilizar a peça da corretora",
      mode: "restyling",
      sources: [{
        sourceId: "source-content",
        usage: "content",
        content: contentBrief({
          product: "Corretora XTB",
          brandElements: ["XTB logo"],
          textContent: { headline: "Invista com a XTB", bullets: [] },
        }),
      }],
      brand: { name: "Cenbrap", requiredElements: "Logo Cenbrap", prohibitedElements: "Concorrentes" },
      clientProfileId: "profile-1",
      brandAuthority: { kind: "source", brandName: "XTB" },
    });
    // The source brand replaces the active kit as the required identity.
    expect(pack.identity).toEqual({ clientProfileId: "profile-1", brandName: "XTB", brandAuthority: "source" });
    expect(pack.facts).toContainEqual({ value: "XTB", class: "brand", required: true, origin: "brand" });
    expect(pack.facts).toContainEqual(
      expect.objectContaining({ value: "XTB logo", class: "brand", origin: "source", sourceId: "source-content" }),
    );
    // The active kit's element lists belong to the other brand and must not
    // leak into the preserved-source piece.
    expect(pack.brand).toEqual({ requiredElements: [], prohibitedElements: [] });
    expect(JSON.stringify(pack.facts)).not.toContain('"Cenbrap"');
  });
});

describe("validateSocialPostCopyAgainstFactPack", () => {
  const pack: CreativeWorkFactPack = buildCreativeWorkFactPack({
    request: PSICOLOGIA_REQUEST,
    mode: "art_variation",
    sources: [...twoContentSources, styleSourceWithForeignFacts],
    brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: null },
    clientProfileId: "profile-1",
  });

  it("accepts copy grounded in the request and sourced facts", () => {
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Grupo de terapia em agosto",
      body: "Cuide da sua mente com encontros semanais. Vagas limitadas no grupo de terapia da Cenbrap.",
      cta: "Inscreva-se",
    }, pack);
    expect(violations).toEqual([]);
  });

  it("flags an invented price, date or entity without origin", () => {
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "50% de desconto na Clínica Vida Plena",
      body: "Somente em setembro você garante 10 sessões.",
      cta: "Aproveite",
    }, pack);
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ class: "price", value: "50%", field: "headline" }),
      expect.objectContaining({ class: "brand", value: "Clínica Vida Plena", field: "headline" }),
      expect.objectContaining({ class: "date", value: "setembro", field: "body" }),
      expect.objectContaining({ class: "proof", value: "10", field: "body" }),
    ]));
  });

  it("flags facts that come only from the style source as unbacked", () => {
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Condomínio fechado",
      body: "Mude-se hoje por R$ 900.000.",
      cta: "Saiba mais",
    }, pack);
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ class: "price", value: "R$ 900.000", field: "body" }),
    ]));
    expect(violations.length).toBeGreaterThan(0);
  });

  it("backs grounded numbers and dates present in the request", () => {
    const datedPack = buildCreativeWorkFactPack({
      request: "Turma de 20 alunos, início em 12/08, inscrições até sexta",
      mode: "social_post",
      sources: [],
      brand: null,
      clientProfileId: "profile-1",
    });
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Turma de 20 alunos",
      body: "Começamos em 12/08. Inscreva-se já.",
      cta: "Quero vaga",
    }, datedPack);
    expect(violations).toEqual([]);
  });

  it("accepts a modality stated in the request and flags an invented one", () => {
    const backed = validateSocialPostCopyAgainstFactPack({
      headline: "Grupo de terapia em agosto",
      body: "Cuide da sua mente com atendimento online. Vagas limitadas.",
      cta: "Inscreva-se",
    }, pack);
    expect(backed).toEqual([]);

    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Grupo de terapia em agosto",
      body: "Cuide da sua mente com atendimento presencial. Vagas limitadas.",
      cta: "Inscreva-se",
    }, pack);
    expect(violations).toEqual([
      expect.objectContaining({ class: "modality", value: "presencial", field: "body" }),
    ]);
  });

  it("flags a prohibited brand element echoed in the copy as its own violation", () => {
    const restrictedPack = buildCreativeWorkFactPack({
      request: PSICOLOGIA_REQUEST,
      mode: "art_variation",
      sources: [...twoContentSources],
      brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: "Sem promessas de cura" },
      clientProfileId: "profile-1",
    });
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Grupo de terapia em agosto",
      body: "Vagas limitadas. Sem promessas de cura, só acolhimento.",
      cta: "Inscreva-se",
    }, restrictedPack);
    expect(violations).toEqual([
      { class: "brand", value: "Sem promessas de cura", field: "body" },
    ]);
  });

  it("never backs copy claims with a prohibited brand element", () => {
    const restrictedPack = buildCreativeWorkFactPack({
      request: PSICOLOGIA_REQUEST,
      mode: "art_variation",
      sources: [...twoContentSources],
      brand: { name: "Cenbrap", requiredElements: null, prohibitedElements: "Desconto de 80%" },
      clientProfileId: "profile-1",
    });
    const violations = validateSocialPostCopyAgainstFactPack({
      headline: "Grupo de terapia em agosto",
      body: "Vagas limitadas com 80% de desconto.",
      cta: "Inscreva-se",
    }, restrictedPack);
    expect(violations).toEqual([
      expect.objectContaining({ class: "price", value: "80%", field: "body" }),
    ]);
  });
});
