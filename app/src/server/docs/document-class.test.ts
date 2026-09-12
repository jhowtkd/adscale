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

  it("treats the 2026-09-12 funnel read as canonical freeze policy", () => {
    expect(classifyAgentSource("docs/decisions/2026-09-12-funnel-read-gate8-holds.md")).toBe("canonical");
    const manifest = JSON.parse(
      readFileSync(
        path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../docs/decisions/allowed-primary-destinations.json"),
        "utf8",
      ),
    ) as { note: string };
    expect(manifest.note).not.toMatch(/until Gate 8 lifts/i);
    expect(manifest.note).toMatch(/does not lift this freeze/);
    expect(manifest.note).toMatch(/campaign\.completed is the wrong unit/);
    expect(manifest.note).toMatch(/studio_entry_started/);
  });

  it("does not treat Gate 8's completed Create Post journey as current Estúdio validation", () => {
    expect(classifyAgentSource("docs/decisions/2026-09-12-estudio-atual-nao-observado.md")).toBe("canonical");
    const decision = readFileSync(
      path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../docs/decisions/2026-09-12-estudio-atual-nao-observado.md",
      ),
      "utf8",
    );
    expect(decision).toMatch(/N01-after-attempt-2/);
    expect(decision).toMatch(/home_create_post/);
    expect(decision).toMatch(/Não valida o Estúdio atual/);
    expect(decision).toMatch(/não são observação de operador/);
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
