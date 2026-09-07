/**
 * Classification of repository documents so agents do not treat old plans as
 * the live product. Canonical terms stay in CONTEXT.md and accepted ADRs.
 */

export type DocClass = "canonical" | "historical" | "proposal";

/**
 * Canonical — current product and operating rules.
 * Historical — once true; keep for archaeology, never implement as if live.
 * Proposal — plans, ICE sheets, and research; implement only after an ADR or
 * CONTEXT update makes the change canonical.
 */
export const DOCUMENT_CLASSES = {
  canonical: [
    "CONTEXT.md",
    "docs/adr/",
    "docs/agents/",
    "docs/decisions/allowed-primary-destinations.json",
    "app/src/server/ai/FROZEN.md",
  ],
  historical: [
    "README.md historical campaign cockpit section (Estúdio is canonical)",
    "docs/ARCHITECTURE.md campaign/cockpit overview (pre-Estúdio spine)",
    "docs/plans/2026-05-23-persona-simulator.md",
    "Landing Page generator and Persona Simulation (ADR 0013 freeze)",
    "GitHub issues that still name Quick Tools / Criar Post as a parallel product",
  ],
  proposal: [
    "docs/plans/",
    "docs/superpowers/plans/",
    ".planning/",
    "ICE spreadsheets and canvases",
  ],
} as const;

/**
 * Open GitHub issues classified against CONTEXT / ADR 0013.
 * Issues are a queue, not the glossary. Campaign-as-spine copy stays historical.
 */
export const OPEN_ISSUE_RECONCILIATION = [
  { number: 171, class: "canonical" as const, note: "Wayfinder map: Peça Única recognizable as the brand" },
  { number: 174, class: "proposal" as const, note: "PreceptorIA baseline before changing generation" },
  { number: 177, class: "proposal" as const, note: "Deterministic asset measurement; not the live Studio spine" },
  { number: 183, class: "proposal" as const, note: "Vision layer over measurement; depends on 177" },
  { number: 193, class: "canonical" as const, note: "Inferred briefing spec; child tickets closed; remaining is evidence/UAT" },
  { number: 227, class: "proposal" as const, note: "PSD layerization — feature, outside ICE M01–M10" },
] as const;

export function classifyAgentSource(path: string): DocClass {
  const normalized = path.replaceAll("\\", "/");
  if (
    normalized === "CONTEXT.md"
    || normalized.startsWith("docs/adr/")
    || normalized.startsWith("docs/agents/")
    || normalized.startsWith("docs/decisions/")
    || normalized.endsWith("FROZEN.md")
  ) {
    return "canonical";
  }
  if (
    normalized.startsWith("docs/plans/")
    || normalized.startsWith("docs/superpowers/plans/")
    || normalized.startsWith(".planning/")
  ) {
    return "proposal";
  }
  return "historical";
}
