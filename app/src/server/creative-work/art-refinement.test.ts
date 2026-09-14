import { artRefinementParentHash } from "@/server/creative-work/art-refinement-parent-hash";
import { describe, expect, it } from "vitest";
import {
  ART_DIRECTION_CRITIQUE_INSTRUCTION,
  artRefinementMaxUnits,
  artRefinementRevisionKey,
  artRefinementRootId,
  artCritiqueSchema,
  carouselRevisionUnits,
  chooseBestCandidate,
  resolveArtCritique,
  resolveArtRefinementBudget,
  resolveRevisionCompositionMode,
  shouldRefine,
  type ArtCritique,
  type RefinementCandidate,
} from "./art-refinement";

const weakCritique: ArtCritique = {
  verdict: "weak",
  problem: "Foco dividido",
  intervention: "Unificar foco",
  mode: "edit",
  preserve: ["marca"],
  evidence: ["Dois títulos dominantes"],
  confidence: "high",
};

const readyCritique: ArtCritique = {
  verdict: "ready",
  problem: "",
  intervention: "",
  mode: "edit",
  preserve: [],
  evidence: [],
  confidence: "high",
};

function candidate(overrides: Partial<RefinementCandidate> & { id: string }): RefinementCandidate {
  return {
    objective: "pass",
    humanReviewRequired: false,
    critique: readyCritique,
    ...overrides,
  };
}

describe("shouldRefine", () => {
  it("não gera outra imagem só porque uma nota foi baixa", () => {
    const critique: ArtCritique = {
      verdict: "weak", problem: "", intervention: "", mode: "recompose",
      preserve: [], evidence: [], confidence: "high",
    };
    expect(shouldRefine({ critique, usedRevisions: 0, isCalibration: false, objective: "pass" })).toBe(false);
  });

  it("refina crítica fraca com evidência dentro do teto", () => {
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 0, isCalibration: false, objective: "pass" })).toBe(true);
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 1, isCalibration: false, objective: "pass" })).toBe(true);
  });

  it("nunca refina crítica pronta, dúvida ou baixa confiança", () => {
    expect(shouldRefine({ critique: readyCritique, usedRevisions: 0, isCalibration: false, objective: "pass" })).toBe(false);
    expect(shouldRefine({
      critique: { ...weakCritique, verdict: "inconclusive" },
      usedRevisions: 0, isCalibration: false, objective: "pass",
    })).toBe(false);
    expect(shouldRefine({
      critique: { ...weakCritique, confidence: "medium" },
      usedRevisions: 0, isCalibration: false, objective: "pass",
    })).toBe(false);
  });

  it("respeita teto de duas revisões, calibração e veredito objetivo", () => {
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 2, isCalibration: false, objective: "pass" })).toBe(false);
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 0, isCalibration: true, objective: "pass" })).toBe(false);
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 0, isCalibration: false, objective: "fail" })).toBe(false);
    expect(shouldRefine({ critique: weakCritique, usedRevisions: 0, isCalibration: false, objective: "inconclusive" })).toBe(false);
  });
});

describe("chooseBestCandidate", () => {
  it("nunca recomenda a versão objetivamente rejeitada", () => {
    const critique: ArtCritique = {
      verdict: "ready", problem: "", intervention: "", mode: "edit",
      preserve: [], evidence: [], confidence: "high",
    };
    expect(chooseBestCandidate([
      { id: "valid", objective: "pass", humanReviewRequired: false, critique },
      { id: "bad", objective: "fail", humanReviewRequired: false, critique },
    ], "bad")?.id).toBe("valid");
  });

  it("mantém a versão anterior quando a revisão não produz uma candidata válida", () => {
    const critique: ArtCritique = {
      verdict: "weak", problem: "Foco dividido", intervention: "Unificar foco",
      mode: "edit", preserve: [], evidence: ["Dois títulos dominantes"], confidence: "high",
    };
    const before: RefinementCandidate = { id: "a", objective: "pass", humanReviewRequired: false, critique };
    expect(chooseBestCandidate([before, { ...before, id: "b", objective: "fail" }], "b")?.id).toBe("a");
  });

  it("prefere pronta, ignora revisão humana pendente e vazio dá nulo", () => {
    const weak = candidate({ id: "weak", critique: weakCritique });
    const ready = candidate({ id: "ready", critique: readyCritique });
    expect(chooseBestCandidate([weak, ready], null)?.id).toBe("ready");
    expect(chooseBestCandidate(
      [candidate({ id: "a", humanReviewRequired: true }), weak],
      "a",
    )?.id).toBe("weak");
    expect(chooseBestCandidate([], null)).toBeNull();
    expect(chooseBestCandidate([candidate({ id: "x", objective: "fail" })], null)).toBeNull();
  });
});

describe("artCritiqueSchema", () => {
  it("rejeita crítica fraca sem causa e resposta inválida vira nula", () => {
    expect(artCritiqueSchema.safeParse({ ...weakCritique, evidence: [] }).success).toBe(false);
    expect(artCritiqueSchema.safeParse({ ...weakCritique, problem: "  " }).success).toBe(false);
    expect(resolveArtCritique({ verdict: "weak" })).toBeNull();
    expect(resolveArtCritique(null)).toBeNull();
  });

  it("limita textos e listas", () => {
    expect(artCritiqueSchema.safeParse({ ...weakCritique, problem: "x".repeat(1001) }).success).toBe(false);
    expect(artCritiqueSchema.safeParse({ ...weakCritique, evidence: Array.from({ length: 11 }, () => "e") }).success).toBe(false);
  });
});

describe("orçamento", () => {
  it("teto é 3 unidades por saída inicial e chave é determinística", () => {
    expect(artRefinementMaxUnits(4)).toBe(12);
    expect(artRefinementMaxUnits(0)).toBe(0);
    expect(artRefinementRevisionKey({ workId: "w", rootId: "r", attempt: 1 }))
      .toBe("art-refinement:w:r:1");
  });

  it("conta a reconstrução dependente do anchor no orçamento", () => {
    expect(carouselRevisionUnits({ changesAnchor: true, dependentSlides: 4 })).toBe(5);
    expect(carouselRevisionUnits({ changesAnchor: false, dependentSlides: 4 })).toBe(1);
    expect(() => carouselRevisionUnits({ changesAnchor: true, dependentSlides: -1 })).toThrow("invalid_dependent_slides");
  });

  it("orçamento exige aceite explícito válido", () => {
    expect(resolveArtRefinementBudget({
      version: 1, maxRevisionsPerRoot: 2, acceptedCreditCeiling: 30,
      acceptedBy: "user-1", acceptedAt: "2026-09-13T00:00:00.000Z",
    })).not.toBeNull();
    expect(resolveArtRefinementBudget({ version: 1, maxRevisionsPerRoot: 2 })).toBeNull();
    expect(resolveArtRefinementBudget({ version: 1, maxRevisionsPerRoot: 3, acceptedCreditCeiling: 1, acceptedBy: "u", acceptedAt: "t" })).toBeNull();
  });

  it("instrução proíbe nota isolada como justificativa", () => {
    expect(ART_DIRECTION_CRITIQUE_INSTRUCTION).toContain("nota isolada não justifica nova imagem");
  });

  it("identifica raiz, vincula parent e nunca usa recompose como escape", () => {
    expect(artRefinementRootId({ id: "a", parentOutputId: null })).toBe("a");
    expect(artRefinementRootId({ id: "b", parentOutputId: "a" })).toBe("a");
    const parent = { id: "p", updatedAt: new Date("2026-09-13T00:00:00.000Z"), outputKey: "k" };
    expect(artRefinementParentHash(parent)).toMatch(/^[a-f0-9]{64}$/);
    expect(artRefinementParentHash({ ...parent, outputKey: "other" })).not.toBe(artRefinementParentHash(parent));
    expect(resolveRevisionCompositionMode("recompose", "art_variation")).toBe("recompose");
    expect(resolveRevisionCompositionMode("recompose", "format_adaptation")).toBe("edit");
    expect(resolveRevisionCompositionMode("recompose", "restyle")).toBe("edit");
    expect(resolveRevisionCompositionMode("edit", null)).toBe("edit");
  });
});

it("keeps creative-work contracts browser-compatible without tree shaking", async () => {
  const { build } = await import("esbuild");
  await expect(build({ entryPoints: ["src/server/creative-work/contracts.ts"],
    bundle: true, platform: "browser", treeShaking: false, write: false,
    logLevel: "silent", })).resolves.toBeDefined();
});
