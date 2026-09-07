import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyAgentSource, OPEN_ISSUE_RECONCILIATION } from "./document-class";

describe("document class for agents", () => {
  it("treats CONTEXT and ADRs as canonical", () => {
    expect(classifyAgentSource("CONTEXT.md")).toBe("canonical");
    expect(classifyAgentSource("docs/adr/0013-trabalho-criativo-first.md")).toBe("canonical");
    expect(classifyAgentSource("docs/agents/domain.md")).toBe("canonical");
  });

  it("treats implementation plans as proposals, not live product", () => {
    expect(classifyAgentSource("docs/plans/2026-07-12-convergencia-produto-arquitetura-implementation-plan.md")).toBe("proposal");
    expect(classifyAgentSource(".planning/phases/109-visual-foundations-and-baseline/109-02-PLAN.md")).toBe("proposal");
  });

  it("treats README and old architecture copy as historical until rewritten", () => {
    expect(classifyAgentSource("README.md")).toBe("historical");
    expect(classifyAgentSource("docs/ARCHITECTURE.md")).toBe("historical");
  });

  it("does not let README reintroduce campaign as a required creative destination", () => {
    const readme = readFileSync(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../README.md"),
      "utf8",
    );
    expect(readme).toMatch(/Campaign is optional grouping, not a required destination/);
    expect(readme).toMatch(/generating does not require one/);
    expect(readme).toMatch(/Do not add new primary destinations here/);
  });

  it("classifies the open GitHub queue against CONTEXT instead of campaign copy", () => {
    expect(OPEN_ISSUE_RECONCILIATION.map((issue) => issue.number).sort((a, b) => a - b)).toEqual([
      171, 174, 177, 183, 193, 227,
    ]);
    expect(OPEN_ISSUE_RECONCILIATION.every((issue) => issue.class === "canonical" || issue.class === "proposal")).toBe(true);
  });
});
