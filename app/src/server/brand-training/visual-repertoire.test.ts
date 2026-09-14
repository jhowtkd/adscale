import { describe, expect, it } from "vitest";

import {
  composeVisualDirection,
  feedbackEvidence,
  normalizeVisualName,
  repertoireMotifs,
  resolveVisualLanguage,
  resolveWorkVisualLanguage,
  validateRepertoireEvidence,
  visualRepertoireSchema,
  type VisualLanguage,
  type VisualRepertoire,
  type VisualRule,
} from "./visual-repertoire";

const RULE_IDS = {
  r1: "11111111-1111-4111-8111-111111111111",
  r2: "22222222-2222-4222-8222-222222222222",
  lang: "33333333-3333-4333-8333-333333333333",
} as const;

function rule(overrides: Partial<VisualRule> = {}): VisualRule {
  return {
    id: RULE_IDS.r1,
    dimension: "hierarchy",
    observation: "Título domina a leitura",
    application: "Dar ao título escala superior ao texto de apoio",
    avoid: "Competição de dois focos",
    evidenceIds: ["inside"],
    confidence: "high",
    ...overrides,
  };
}

describe("visual repertoire contracts", () => {
  it("não aceita padrão sem referência verificável", () => {
    const repertoire: VisualRepertoire = {
      version: 1,
      common: [{
        id: "r1",
        dimension: "hierarchy",
        observation: "Título domina a leitura",
        application: "Dar ao título escala superior ao texto de apoio",
        avoid: "Competição de dois focos",
        evidenceIds: ["outside"],
        confidence: "high",
      }],
      languages: [],
    };
    expect(() => validateRepertoireEvidence(repertoire, new Set(["inside"])))
      .toThrow("unknown_repertoire_evidence");
  });

  it("não converte uma rejeição sem comentário em regra de cor ou layout", () => {
    expect(feedbackEvidence({ rating: "bad", note: "  " })).toEqual({
      preference: "bad",
      instruction: null,
    });
  });

  it("solicita escolha quando duas linguagens têm o mesmo nome", () => {
    const languages = ["one", "two"].map((id) => ({ id, name: "Comercial", contexts: [], rules: [] }));
    expect(resolveVisualLanguage({
      repertoire: { version: 1, common: [], languages },
      explicitId: null,
      mentionedName: "Comercial",
      context: null,
    })).toEqual({ kind: "ambiguous", ids: ["one", "two"] });
  });

  it("aceita coleção válida com UUIDs e rejeita extra, texto longo e excesso", () => {
    const valid: VisualRepertoire = {
      version: 1,
      common: [rule()],
      languages: [{ id: RULE_IDS.lang, name: "Comercial", contexts: ["oferta"], rules: [rule({ id: RULE_IDS.r2 })] }],
    };
    expect(visualRepertoireSchema.parse(valid)).toMatchObject({ version: 1 });
    expect(visualRepertoireSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(visualRepertoireSchema.safeParse({
      ...valid,
      common: [rule({ observation: "x".repeat(601) })],
    }).success).toBe(false);
    expect(visualRepertoireSchema.safeParse({
      ...valid,
      common: Array.from({ length: 21 }, (_, index) => rule({ id: `11111111-1111-4111-8111-1111111111${String(index).padStart(2, "0").slice(-2)}` })),
    }).success).toBe(false);
    expect(visualRepertoireSchema.safeParse({
      ...valid,
      common: [rule({ id: "not-a-uuid" })],
    }).success).toBe(false);
  });

  it("rejeita regra sem evidência mesmo quando as fontes existem", () => {
    const repertoire: VisualRepertoire = { version: 1, common: [rule({ evidenceIds: [] })], languages: [] };
    expect(() => validateRepertoireEvidence(repertoire, new Set(["inside"])))
      .toThrow("unknown_repertoire_evidence");
  });

  it("resolve por ID explícito, nome normalizado e contexto, com fallback comum", () => {
    const first: VisualLanguage = { id: "one", name: " Comercial ", contexts: ["Oferta"], rules: [] };
    const second: VisualLanguage = { id: "two", name: "Institucional", contexts: ["marca"], rules: [] };
    const repertoire: VisualRepertoire = { version: 1, common: [], languages: [first, second] };
    expect(resolveVisualLanguage({ repertoire, explicitId: "two", mentionedName: "Comercial", context: "oferta" }))
      .toEqual({ kind: "resolved", language: second });
    expect(resolveVisualLanguage({ repertoire, explicitId: "missing", mentionedName: null, context: null }))
      .toEqual({ kind: "missing" });
    expect(resolveVisualLanguage({ repertoire, explicitId: null, mentionedName: "comercial", context: null }))
      .toEqual({ kind: "resolved", language: first });
    expect(resolveVisualLanguage({ repertoire, explicitId: null, mentionedName: "Desconhecida", context: null }))
      .toEqual({ kind: "missing" });
    expect(resolveVisualLanguage({ repertoire, explicitId: null, mentionedName: null, context: "MARCA" }))
      .toEqual({ kind: "resolved", language: second });
    expect(resolveVisualLanguage({ repertoire, explicitId: null, mentionedName: null, context: "evento" }))
      .toEqual({ kind: "resolved", language: null });
    expect(resolveVisualLanguage({ repertoire, explicitId: null, mentionedName: null, context: null }))
      .toEqual({ kind: "resolved", language: null });
  });

  it("normaliza nomes com NFKC e caixa pt-BR", () => {
    expect(normalizeVisualName("  Comercial  ")).toBe("comercial");
  });

  it("preserva instrução de feedback com nota, sem inventar regra", () => {
    expect(feedbackEvidence({ rating: "good", note: "Manter respiro do título" })).toEqual({
      preference: "good",
      instruction: "Manter respiro do título",
    });
  });
});

describe("resolveWorkVisualLanguage", () => {
  const commercial: VisualLanguage = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    name: "Comercial",
    contexts: ["oferta"],
    rules: [],
  };
  const repertoire: VisualRepertoire = {
    version: 1,
    common: [],
    languages: [commercial],
  };

  it("resolve por ID explícito e bloqueia ID desconhecido com opções", () => {
    expect(resolveWorkVisualLanguage({
      repertoire,
      explicitId: commercial.id,
      text: "",
    })).toEqual({ ok: true, language: commercial });
    expect(resolveWorkVisualLanguage({
      repertoire,
      explicitId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      text: "",
    })).toEqual({
      ok: false,
      error: {
        code: "visual_language_unknown",
        visualLanguageId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        options: [{ id: commercial.id, name: "Comercial" }],
      },
    });
  });

  it("resolve menção no briefing e pede escolha entre homônimas", () => {
    expect(resolveWorkVisualLanguage({
      repertoire,
      text: "Peça Comercial para a oferta de julho",
    })).toEqual({ ok: true, language: commercial });
    const twins: VisualRepertoire = {
      version: 1,
      common: [],
      languages: [
        commercial,
        { ...commercial, id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
      ],
    };
    expect(resolveWorkVisualLanguage({ repertoire: twins, text: "peça comercial" })).toEqual({
      ok: false,
      error: {
        code: "visual_language_ambiguous",
        name: "Comercial",
        options: [
          { id: commercial.id, name: "Comercial" },
          { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Comercial" },
        ],
      },
    });
  });

  it("nome desconhecido não cria linguagem nem bloqueia: usa o comum", () => {
    expect(resolveWorkVisualLanguage({
      repertoire,
      text: "Peça Experimental inédita",
    })).toEqual({ ok: true, language: null });
    expect(resolveWorkVisualLanguage({ repertoire: null, text: "qualquer texto" }))
      .toEqual({ ok: true, language: null });
  });

  it("não confunde substring com menção à linguagem", () => {
    expect(resolveWorkVisualLanguage({
      repertoire: { version: 1, common: [], languages: [{ ...commercial, name: "An" }] },
      text: "Análise de resultados",
    })).toEqual({ ok: true, language: null });
  });
});

describe("composeVisualDirection", () => {
  const uuid = (seed: string) => `00000000-0000-4000-8000-${seed.padStart(12, "0")}`;
  const commonRule = (overrides: Partial<VisualRule> = {}): VisualRule => ({
    id: uuid("1"),
    dimension: "hierarchy",
    observation: "Título domina a leitura",
    application: "Dar ao título escala superior ao texto de apoio",
    avoid: "Competição de dois focos",
    evidenceIds: ["ref-1"],
    confidence: "high",
    ...overrides,
  });

  it("compõe direção congelada com regras comuns e da linguagem", () => {
    const language: VisualLanguage = {
      id: uuid("2"),
      name: "Comercial",
      contexts: ["oferta"],
      rules: [commonRule({
        id: uuid("3"),
        dimension: "typography",
        observation: "Títulos condensados",
        application: "Usar caixa alta condensada nos títulos",
        avoid: "",
      })],
    };
    const direction = composeVisualDirection({
      repertoire: { version: 1, common: [commonRule()], languages: [language] },
      language,
    });
    expect(direction).toMatchObject({
      languageId: uuid("2"),
      ruleIds: [uuid("1"), uuid("3")],
      dominantIdea: "Dar ao título escala superior ao texto de apoio",
      typography: "Usar caixa alta condensada nos títulos",
      preserve: ["Competição de dois focos"],
    });
  });

  it("linguagem nunca ignora proibição comum aprovada", () => {
    const language: VisualLanguage = {
      id: uuid("2"),
      name: "Comercial",
      contexts: ["oferta"],
      rules: [commonRule({ id: uuid("3"), avoid: "" })],
    };
    const direction = composeVisualDirection({
      repertoire: { version: 1, common: [commonRule({ avoid: "Nunca usar neon" })], languages: [language] },
      language,
    });
    expect(direction?.preserve).toEqual(["Nunca usar neon"]);
  });

  it("retorna nulo sem regras e limita ruleIds a 30", () => {
    expect(composeVisualDirection({
      repertoire: { version: 1, common: [], languages: [] },
      language: null,
    })).toBeNull();
    const many = Array.from({ length: 35 }, (_, index) => commonRule({ id: uuid(String(index + 10)) }));
    const direction = composeVisualDirection({
      repertoire: { version: 1, common: many, languages: [] },
      language: null,
    });
    expect(direction?.ruleIds).toHaveLength(30);
  });

  it("extrai motivos aplicáveis para o contrato do carrossel", () => {
    const language: VisualLanguage = {
      id: uuid("2"),
      name: "Comercial",
      contexts: ["oferta"],
      rules: [commonRule({ id: uuid("3"), dimension: "motif", application: "Repetir o selo circular" })],
    };
    expect(repertoireMotifs({
      repertoire: {
        version: 1,
        common: [commonRule({ dimension: "motif", application: "Faixa diagonal recorrente" })],
        languages: [language],
      },
      language,
    })).toEqual(["Faixa diagonal recorrente", "Repetir o selo circular"]);
    expect(repertoireMotifs({
      repertoire: { version: 1, common: [commonRule()], languages: [] },
      language: null,
    })).toEqual([]);
  });
});
