import { describe, expect, it, vi } from "vitest";

import type { BrandTrainingAnalysis } from "./contracts";
import {
  REPERTOIRE_EXTRACTOR_VERSION,
  repertoireCacheKey,
  RepertoireSelectionRequiredError,
  RepertoireSynthesisError,
  synthesizeRepertoire,
  type RepertoireFeedback,
  type RepertoireSource,
  type SynthesizeRepertoireDeps,
} from "./synthesize-repertoire";

const analysis: BrandTrainingAnalysis = {
  description: "Peça com título dominante e respiro generoso.",
  visualAttributes: ["título dominante"],
  rules: ["Dar escala ao título"],
  constraints: ["Não competir focos"],
  confidence: 0.9,
};

function source(id: string, hash = `hash-${id}`): RepertoireSource {
  return { id, hash, analysis };
}

const proposal = (evidenceIds: string[]) => ({
  common: [{
    dimension: "hierarchy",
    observation: "Título domina a leitura",
    application: "Dar ao título escala superior ao texto de apoio",
    avoid: "Competição de dois focos",
    evidenceIds,
    confidence: "high",
  }],
  languages: [],
});

function deps(overrides: Partial<SynthesizeRepertoireDeps> = {}): SynthesizeRepertoireDeps & {
  proposeGroup: ReturnType<typeof vi.fn>;
} {
  return {
    listSources: async () => [source("b"), source("a")],
    proposeGroup: vi.fn(async () => proposal(["a", "b"])),
    randomId: (() => {
      let counter = 0;
      return () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
    })(),
    ...overrides,
  };
}

const input = { workspaceId: "ws", profileId: "profile", referenceIds: ["a", "b"], feedback: [] as RepertoireFeedback[] };

describe("synthesize visual repertoire", () => {
  it("sintetiza um lote com evidências verificáveis e IDs do servidor", async () => {
    const repertoire = await synthesizeRepertoire(input, deps());
    expect(repertoire.version).toBe(1);
    expect(repertoire.common).toHaveLength(1);
    expect(repertoire.common[0]).toMatchObject({ observation: "Título domina a leitura", confidence: "high" });
    expect(repertoire.common[0]!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("deduplica fontes por hash antes de agrupar", async () => {
    const seen: string[][] = [];
    const d = deps({
      listSources: async () => [source("a", "same"), source("b", "same"), source("c", "other")],
      proposeGroup: vi.fn(async ({ sources }: { sources: RepertoireSource[] }) => {
        seen.push(sources.map((entry) => entry.id));
        return proposal(sources.map((entry) => entry.id));
      }),
    });
    const repertoire = await synthesizeRepertoire(input, d);
    expect(seen).toEqual([["a", "c"]]);
    expect(d.proposeGroup).toHaveBeenCalledTimes(1);
    expect(repertoire.common[0]!.evidenceIds).toEqual(["a", "c"]);
  });

  it("rejeita evidência externa ao lote", async () => {
    await expect(synthesizeRepertoire(
      input,
      deps({ proposeGroup: vi.fn(async () => proposal(["outside"])) }),
    )).rejects.toThrow("unknown_repertoire_evidence");
  });

  it("persiste erro recuperável para saída inválida, sem laço de correção", async () => {
    const d = deps({ proposeGroup: vi.fn(async () => ({ common: "not-a-list" })) });
    const error = await synthesizeRepertoire(input, d).catch((cause) => cause as RepertoireSynthesisError);
    expect(error).toBeInstanceOf(RepertoireSynthesisError);
    expect(error.recoverable).toBe(true);
    expect(d.proposeGroup).toHaveBeenCalledTimes(1);
  });

  it("rebaixa padrão de evidência única para hipótese", async () => {
    const repertoire = await synthesizeRepertoire(
      input,
      deps({ proposeGroup: vi.fn(async () => proposal(["a"])) }),
    );
    expect(repertoire.common[0]).toMatchObject({ confidence: "low" });
  });

  it("agrupa de oito em oito com uma consolidação e exige seleção acima de 48", async () => {
    const many = Array.from({ length: 20 }, (_, index) => source(`ref-${String(index).padStart(2, "0")}`));
    const d = deps({
      listSources: async () => many,
      proposeGroup: vi.fn(async ({ sources }: { sources: RepertoireSource[] }) =>
        proposal(sources.map((entry) => entry.id)),
      ),
      consolidate: vi.fn(async ({ merged }: { merged: unknown }) => {
        const value = merged as { common: Array<Record<string, unknown>>; languages: unknown[] };
        return {
          common: value.common.map((rule) => {
            const rest = { ...rule };
            delete rest.id;
            return rest;
          }),
          languages: [],
        };
      }),
    });
    await synthesizeRepertoire(input, d);
    expect(d.proposeGroup).toHaveBeenCalledTimes(3);
    expect(d.consolidate).toHaveBeenCalledTimes(1);

    const tooMany = Array.from({ length: 49 }, (_, index) => source(`ref-${index}`));
    const error = await synthesizeRepertoire(
      input,
      deps({ listSources: async () => tooMany }),
    ).catch((cause) => cause as RepertoireSelectionRequiredError);
    expect(error).toBeInstanceOf(RepertoireSelectionRequiredError);
  });

  it("reutiliza cache por hash ordenado, extrator e feedback", async () => {
    const cache = new Map();
    const d = deps({ cache, listSources: async () => [source("a"), source("b")] });
    const first = await synthesizeRepertoire(input, d);
    const second = await synthesizeRepertoire(input, d);
    expect(second).toBe(first);
    expect(d.proposeGroup).toHaveBeenCalledTimes(1);
    expect(repertoireCacheKey({
      sourceHashes: ["hash-b", "hash-a"],
      extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
      feedback: [],
    })).toBe(repertoireCacheKey({
      sourceHashes: ["hash-a", "hash-b"],
      extractorVersion: REPERTOIRE_EXTRACTOR_VERSION,
      feedback: [],
    }));
  });

  it("não refaz chamadas por feedback idêntico, mas muda com nota nova", async () => {
    const cache = new Map();
    const d = deps({ cache });
    await synthesizeRepertoire(input, d);
    await synthesizeRepertoire(
      { ...input, feedback: [{ outputId: "out", rating: "bad", note: "título pequeno" }] },
      d,
    );
    expect(d.proposeGroup).toHaveBeenCalledTimes(2);
  });
});
