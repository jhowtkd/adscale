import { describe, expect, it } from "vitest";
import { buildPlanSemanticChanges } from "./diff";

const baseSnapshot = {
  type: "plan" as const,
  strategy: "Estratégia original",
  angles: ["Ângulo A", "Ângulo B"],
  hooks: ["Hook 1"],
  ctas: ["Compre agora"],
  constraints: "Sem logo vermelho",
};

describe("buildPlanSemanticChanges", () => {
  it("returns empty array for identical snapshots", () => {
    expect(buildPlanSemanticChanges(baseSnapshot, { ...baseSnapshot })).toEqual([]);
  });

  it("emits one change per modified field", () => {
    const after = {
      ...baseSnapshot,
      strategy: "Nova estratégia",
      ctas: ["Compre já"],
    };
    const changes = buildPlanSemanticChanges(baseSnapshot, after);
    expect(changes).toHaveLength(2);
    expect(changes.map((change) => change.field).sort()).toEqual(["ctas", "strategy"]);
  });

  it("reports list reordering as a semantic change", () => {
    const before = { ...baseSnapshot, angles: ["B", "A"] };
    const after = { ...baseSnapshot, angles: ["A", "B"] };
    expect(buildPlanSemanticChanges(before, after)).toEqual([
      { field: "angles", description: "Campo ângulos atualizado" },
    ]);
  });

  it("detects list content changes after normalization", () => {
    const after = { ...baseSnapshot, hooks: ["Hook 1", "Hook 2"] };
    const changes = buildPlanSemanticChanges(baseSnapshot, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.field).toBe("hooks");
  });

  it("detects nullable text field changes", () => {
    const after = { ...baseSnapshot, constraints: null };
    const changes = buildPlanSemanticChanges(baseSnapshot, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.field).toBe("constraints");
  });
});
