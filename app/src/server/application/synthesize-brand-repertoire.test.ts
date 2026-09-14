import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { BrandTrainingAnalysis } from "../brand-training/contracts";
import { RepertoireSelectionRequiredError } from "../brand-training/synthesize-repertoire";
import {
  renderRepertoireSynthesisInput,
  synthesizeBrandRepertoire,
  type SynthesizeBrandRepertoireDeps,
} from "./synthesize-brand-repertoire";

const analysis: BrandTrainingAnalysis = {
  description: "Peça com título dominante e respiro generoso.",
  visualAttributes: ["título dominante"],
  rules: ["Dar escala ao título"],
  constraints: ["Não competir focos"],
  confidence: 0.9,
};

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

function deps(overrides: Partial<SynthesizeBrandRepertoireDeps> = {}): SynthesizeBrandRepertoireDeps {
  return {
    listAnalyzedReferences: async () => [
      { id: "ref-a", assetKey: "assets/a.png", analysis },
      { id: "ref-b", assetKey: "assets/b.png", analysis },
    ],
    resolveAssetHashes: async ({ assetKeys }) => new Map(
      assetKeys.map((key) => [key, createHash("sha256").update(key).digest("hex")]),
    ),
    proposeGroup: vi.fn(async ({ sources }: { sources: Array<{ id: string }> }) =>
      proposal(sources.map((source) => source.id)),
    ),
    persistCandidates: vi.fn(async (claims) => claims.map((claim, index) => ({
      id: `claim-${index}`,
      workspaceId: "ws",
      clientProfileId: "profile",
      status: "candidate",
      reviewedAt: null,
      reviewedByUserId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...claim,
    })) as never),
    ...overrides,
  };
}

const input = { workspaceId: "ws", profileId: "profile" };

describe("synthesizeBrandRepertoire", () => {
  it("sintetiza sobre as referências aprovadas e persiste a candidata", async () => {
    const d = deps();
    const { claim, repertoire } = await synthesizeBrandRepertoire(input, d);
    expect(repertoire.version).toBe(1);
    expect(repertoire.common).toHaveLength(1);
    expect(d.persistCandidates).toHaveBeenCalledTimes(1);
    const [candidates] = (d.persistCandidates as ReturnType<typeof vi.fn>).mock.calls[0] as [
      Array<{ claimKey: string; evidenceRefs: Array<{ id: string; sourceHash: string }> }>,
    ];
    expect(candidates[0]?.claimKey).toBe("visual.repertoire");
    expect(candidates[0]?.evidenceRefs.map((evidence) => evidence.id).sort())
      .toEqual(["ref-a", "ref-b"]);
    expect(claim?.claimKey).toBe("visual.repertoire");
  });

  it("rejeita subconjunto com referência não aprovada e lote vazio", async () => {
    await expect(synthesizeBrandRepertoire(input, deps({
      listAnalyzedReferences: async () => [],
    }))).rejects.toMatchObject({ name: "BrandRepertoireError", code: "no_sources" });
    await expect(synthesizeBrandRepertoire(
      { ...input, referenceIds: ["ref-a", "ref-ghost"] },
      deps(),
    )).rejects.toMatchObject({ name: "BrandRepertoireError", code: "unknown_reference" });
  });

  it("não sintetiza sobre fonte sem hash verificável", async () => {
    await expect(synthesizeBrandRepertoire(input, deps({
      resolveAssetHashes: async () => new Map(),
    }))).rejects.toMatchObject({ name: "BrandRepertoireError", code: "unverifiable_source" });
  });

  it("propaga o pedido de seleção acima de 48 fontes", async () => {
    const many = Array.from({ length: 49 }, (_, index) => ({
      id: `ref-${index}`,
      assetKey: `assets/${index}.png`,
      analysis,
    }));
    await expect(synthesizeBrandRepertoire(input, deps({
      listAnalyzedReferences: async () => many,
      resolveAssetHashes: async ({ assetKeys }) => new Map(
        assetKeys.map((key) => [key, createHash("sha256").update(key).digest("hex")]),
      ),
    }))).rejects.toBeInstanceOf(RepertoireSelectionRequiredError);
  });

  it("renderiza rejeição sem nota como preferência, nunca como regra", () => {
    const rendered = renderRepertoireSynthesisInput(
      [{ id: "ref-a", hash: "h", analysis }],
      [
        { outputId: "out-1", rating: "bad", note: "  " },
        { outputId: "out-2", rating: "bad", note: "título pequeno" },
      ],
    );
    expect(rendered).toContain("[ref-a]");
    expect(rendered).toContain("[out-1] bad (sem comentário)");
    expect(rendered).toContain("[out-2] bad: título pequeno");
    expect(rendered).not.toContain("proibição");
  });

  it("reutiliza a candidata existente para as mesmas fontes", async () => {
    const persistCandidates = vi.fn(async (claims: Array<{ sourceHash: string }>) => [
      { id: "claim-other", claimKey: "palette.colors", sourceHash: "x".repeat(64) },
      { id: "claim-existing", claimKey: "visual.repertoire", sourceHash: claims[0]!.sourceHash },
    ] as never);
    const { claim } = await synthesizeBrandRepertoire(input, deps({ persistCandidates }));
    expect(claim?.id).toBe("claim-existing");
  });
});
