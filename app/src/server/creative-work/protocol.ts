import type { GenerationMode } from "@/server/generation/canonical/types";
import {
  quoteCreativeWork,
  type CreativeWorkFormat,
  type CreativeWorkIntent,
  type CreativeWorkOutputPlan,
} from "./contracts";

/**
 * How a planned visible output reaches the provider (R-001 / spec 6.2).
 *
 * - `direct`: exactly one high-quality image call per visible output. The
 *   executor must not invoke the route planner, the candidate judge, hidden
 *   candidates or refinement.
 * - `legacy_tournament`: the legacy Criar Post adapter — route planner,
 *   candidate judge and optional refinement. Kept for the explicit legacy
 *   `social_post` toolKind until its own migration; it is NOT Peça única.
 */
export type CreativeWorkExecutionPolicy = "direct" | "legacy_tournament";

export interface CreativeWorkProtocolResolution {
  /** Canonical mode sent to the executor for each visible output. */
  mode: GenerationMode;
  /** Execution policy applied to every planned output of the work. */
  execution: CreativeWorkExecutionPolicy;
  /** Visible outputs to persist, bill and dispatch. */
  plans: CreativeWorkOutputPlan[];
}

/**
 * Single pure translation from `toolKind` (+ revision) to the canonical mode,
 * the visible output plan and the execution policy (R-001 / spec 6.1–6.3).
 *
 * The executor stays unique: this resolution is the only place that decides
 * which mode and execution behavior each protocol gets. Output plans are
 * materialized by `quoteCreativeWork`, which remains the billing authority.
 */
export function resolveCreativeWorkProtocol(input: {
  toolKind: CreativeWorkIntent;
  format: CreativeWorkFormat;
  targetFormats: readonly CreativeWorkFormat[];
  /** True when resolving a revision output linked to a completed parent. */
  revision?: boolean;
}): CreativeWorkProtocolResolution {
  if (input.revision) {
    return {
      mode: "creative_revision",
      execution: "direct",
      plans: [{ creativeLevel: "balanced", targetFormat: input.format, versionNumber: 1 }],
    };
  }
  const { plans } = quoteCreativeWork({
    intent: input.toolKind,
    format: input.format,
    targetFormats: input.targetFormats,
  });
  switch (input.toolKind) {
    case "single":
      return { mode: "social_post", execution: "direct", plans };
    case "variations":
      return { mode: "art_variation", execution: "direct", plans };
    case "format_adaptation":
      return { mode: "format_adaptation", execution: "direct", plans };
    case "restyle":
      return { mode: "restyling", execution: "direct", plans };
    case "social_post":
    default:
      // Legacy Criar Post keeps its current adapter (three level plans plus
      // the route tournament) until explicit migration work.
      return { mode: "social_post", execution: "legacy_tournament", plans };
  }
}
