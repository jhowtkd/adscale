import { describe, expect, it } from "vitest";
import { canonicalProposalPayloadDigest } from "./digest";

const basePayload = {
  type: "plan_revision" as const,
  schemaVersion: 1 as const,
  summary: "Ajuste nos CTAs e estratégia",
  proposedSnapshot: {
    type: "plan" as const,
    strategy: "Nova estratégia",
    angles: ["Ângulo A"],
    hooks: ["Hook 1"],
    ctas: ["Compre já"],
    constraints: null,
  },
  changes: [{ field: "ctas", description: "CTA atualizado" }],
  writes: ["Cria v3 do plano"],
};

describe("canonicalProposalPayloadDigest", () => {
  it("is stable for equivalent payload objects", () => {
    const first = canonicalProposalPayloadDigest(basePayload);
    const second = canonicalProposalPayloadDigest({ ...basePayload });
    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when proposed snapshot differs", () => {
    const first = canonicalProposalPayloadDigest(basePayload);
    const second = canonicalProposalPayloadDigest({
      ...basePayload,
      proposedSnapshot: {
        ...basePayload.proposedSnapshot,
        strategy: "Outra estratégia",
      },
    });
    expect(first).not.toBe(second);
  });

  it("changes when changes array differs", () => {
    const first = canonicalProposalPayloadDigest(basePayload);
    const second = canonicalProposalPayloadDigest({
      ...basePayload,
      changes: [{ field: "strategy", description: "Estratégia revisada" }],
    });
    expect(first).not.toBe(second);
  });
});
