import type { CreativeWorkIntent } from "./contracts";

export const PUBLISHED_BRAND_KNOWLEDGE_PROTOCOLS = ["single", "carousel"] as const;

export type ProtocolIdentityContract = {
  publishedBrandKnowledge: "always" | "flagged" | "never";
  typographyPlan: boolean;
  restyleOriginalUsage: "content" | null;
};

export function protocolIdentityContract(toolKind: CreativeWorkIntent): ProtocolIdentityContract {
  switch (toolKind) {
    case "carousel":
      return { publishedBrandKnowledge: "always", typographyPlan: false, restyleOriginalUsage: null };
    case "single":
      return { publishedBrandKnowledge: "flagged", typographyPlan: true, restyleOriginalUsage: null };
    case "restyle":
      return { publishedBrandKnowledge: "never", typographyPlan: false, restyleOriginalUsage: "content" };
    default:
      return { publishedBrandKnowledge: "never", typographyPlan: false, restyleOriginalUsage: null };
  }
}

export function shouldIncludePublishedBrandKnowledge(
  toolKind: CreativeWorkIntent,
  flags: { brandCortexSinglePieceEnabled?: string | boolean } = {},
): boolean {
  const contract = protocolIdentityContract(toolKind);
  if (contract.publishedBrandKnowledge === "always") return true;
  if (contract.publishedBrandKnowledge === "never") return false;
  return flags.brandCortexSinglePieceEnabled === true
    || flags.brandCortexSinglePieceEnabled === "true";
}

export function shouldBuildTypographyPlan(toolKind: CreativeWorkIntent): boolean {
  return protocolIdentityContract(toolKind).typographyPlan;
}
