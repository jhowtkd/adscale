import { describe, expect, it } from "vitest";
import { artifactVersionComparisonSchema } from "@/lib/assistant/artifact-version";
import { buildPlanSemanticComparison } from "../plan-iteration/diff";

const plan = {
  type: "plan" as const,
  strategy: "Estratégia",
  angles: ["A", "B", "A"],
  hooks: ["H1"],
  ctas: ["Comprar"],
  constraints: "Sem promessas",
};

describe("artifact version comparison contracts", () => {
  it("keeps canonical field order and can include unchanged fields", () => {
    expect(
      buildPlanSemanticComparison(plan, { ...plan }, true).map(
        (entry) => entry.field
      )
    ).toEqual(["strategy", "angles", "hooks", "ctas", "constraints"]);
    expect(buildPlanSemanticComparison(plan, { ...plan })).toEqual([]);
  });

  it("reports duplicate-safe pure reordering as moves", () => {
    const [angles] = buildPlanSemanticComparison(plan, {
      ...plan,
      angles: ["A", "A", "B"],
    });

    expect(angles?.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "move", value: "B", beforeIndex: 1, afterIndex: 2 }),
        expect.objectContaining({ kind: "move", value: "A", beforeIndex: 2, afterIndex: 1 }),
      ])
    );
  });

  it("distinguishes add, remove, and edit", () => {
    const before = { ...plan, hooks: ["Keep", "Remove", "Edit me"] };
    const after = { ...plan, hooks: ["Keep", "Edited", "Added"] };
    const [hooks] = buildPlanSemanticComparison(before, after);

    expect(hooks?.changes.map((change) => change.kind)).toEqual([
      "unchanged",
      "edit",
      "edit",
    ]);
    expect(hooks?.changes[1]).toMatchObject({ before: "Remove", after: "Edited" });
    expect(hooks?.changes[2]).toMatchObject({ before: "Edit me", after: "Added" });
  });

  it("rejects persisted creative internals from the response DTO", () => {
    const safe = {
      type: "creative" as const,
      headRevision: 3,
      versionA: {
        versionNumber: 1,
        status: "approved",
        createdAt: new Date(),
        feedback: null,
        previewUrl: "https://signed.example/a",
        previewError: null,
        format: "1:1",
        dimensions: { width: 1080, height: 1080 },
        cta: "Comprar",
        boundPlanVersion: "v1",
        intendedChanges: [],
      },
      versionB: {
        versionNumber: 2,
        status: "ready",
        createdAt: new Date(),
        feedback: "Aumentar contraste",
        previewUrl: null,
        previewError: "preview_unavailable",
        format: "1:1",
        dimensions: { width: 1080, height: 1080 },
        cta: "Comprar",
        boundPlanVersion: "v1",
        intendedChanges: ["Aumentar contraste"],
      },
    };

    expect(artifactVersionComparisonSchema.parse(safe)).toMatchObject(safe);
    for (const key of ["outputKey", "derivationId", "provider", "prompt", "provenance"]) {
      expect(() =>
        artifactVersionComparisonSchema.parse({
          ...safe,
          versionA: { ...safe.versionA, [key]: "secret" },
        })
      ).toThrow();
    }
  });
});
