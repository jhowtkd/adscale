import type {
  CanonicalCreativePolicy,
  CreativeContract,
  CreativeFidelityLevel,
  CtaSemantics,
} from "./creative-contract";
import { resolveCreativeFidelityLevel } from "./creative-contract";
import { resolveAllowedEntitiesForCampaign } from "./creative-corpus";

export interface InvariantIdentity {
  campaign: string;
  brand: string;
  product: string;
  palette: string;
  people: string[];
}

export interface ContentTiers {
  mandatory: string[];
  condensable: string[];
  decorative: string[];
}

export interface CanonicalCreative {
  dominantIdea: string;
  hook: string;
  proofZone: string;
  invariantIdentity: InvariantIdentity;
  tiers: ContentTiers;
}

export const PRECEDENCE_RULES = `RULE PRECEDENCE (highest wins):
1. Factual accuracy — no invented entities; preserve Tier mandatory meaning.
2. Requested fidelity — the resolved fidelity band bounds visual-system distance from the reference.
3. Art direction — composition, typography, rhythm, and styling rank otherwise eligible outputs; they never override facts or fidelity.`;

export interface CanonicalCampaignInput {
  name?: string | null;
  objective?: string | null;
}

export interface CanonicalDiagnosisInput {
  detectedConcept?: string;
}

const DEFAULT_TIERS: ContentTiers = {
  mandatory: [
    "hook/headline",
    "offer/proof",
    "logo if present",
    "product/subject",
  ],
  condensable: ["badges", "duration labels", "bullet pillars", "legal copy"],
  decorative: ["icon rows", "selos", "card chrome", "background shapes"],
};

function trimOrDefault(
  value: string | null | undefined,
  fallback: string
): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function resolveCtaLine(ctaSemantics: CtaSemantics): string {
  if (ctaSemantics.kind === "explicit") {
    return ctaSemantics.text;
  }
  if (ctaSemantics.kind === "inherited") {
    return "inherit from reference";
  }
  return "absent";
}

/**
 * Resolves the single canonical creative policy for a generation. The policy
 * is identical across modes today; the mode parameter keeps the call sites
 * honest and leaves room for mode-specific policy without a new resolver.
 * Fallback callers resolve "balanced" so old rows stay readable.
 */
export function resolveCanonicalCreativePolicy(
  _mode: CreativeContract["generationMode"],
  fidelityLevel: CreativeFidelityLevel = "balanced"
): CanonicalCreativePolicy {
  return {
    fidelityLevel,
    cta: { presence: "optional", wording: "preserve_action_intent" },
    copy: "facts_fixed_expression_flexible",
    heuristics: [
      "three_zones",
      "free_space_20_percent",
      "safe_margin_8_percent",
      "thumbnail_25_percent",
    ],
  };
}

export function resolveCanonicalCreative(
  contract: CreativeContract,
  campaign?: CanonicalCampaignInput | null,
  diagnosis?: CanonicalDiagnosisInput | null
): CanonicalCreative {
  const dominantIdea = trimOrDefault(
    diagnosis?.detectedConcept,
    trimOrDefault(
      campaign?.objective,
      trimOrDefault(contract.offer, "Campaign core message from reference")
    )
  );

  const allowedEntities = campaign
    ? resolveAllowedEntitiesForCampaign({
        name: campaign.name,
        client: contract.client,
      })
    : null;

  const baseBrand = trimOrDefault(contract.client, "source brand");
  const people =
    allowedEntities && allowedEntities.people.length > 0
      ? [...allowedEntities.people]
      : [];
  const brand =
    allowedEntities && allowedEntities.brands.length > 0
      ? [...new Set([baseBrand, ...allowedEntities.brands])].join(", ")
      : baseBrand;

  return {
    dominantIdea,
    hook: trimOrDefault(contract.offer, "Primary headline from reference"),
    proofZone: trimOrDefault(
      contract.product,
      trimOrDefault(contract.client, "Supporting proof from reference")
    ),
    invariantIdentity: {
      campaign: trimOrDefault(campaign?.name, "source campaign"),
      brand,
      product: trimOrDefault(contract.product, "source product"),
      palette: "from reference and brand kit",
      people,
    },
    tiers: DEFAULT_TIERS,
  };
}

export function buildCanonicalContractPromptSection(
  contract: CreativeContract
): string[] {
  const c =
    contract.canonicalCreative ?? resolveCanonicalCreative(contract);
  const policy =
    contract.policy ??
    resolveCanonicalCreativePolicy(
      contract.generationMode,
      resolveCreativeFidelityLevel(contract.creativeLevel)
    );
  const peopleLabel =
    c.invariantIdentity.people.length > 0
      ? c.invariantIdentity.people.join(", ")
      : "as in source";

  return [
    "",
    "CANONICAL CREATIVE CONTRACT:",
    `Dominant idea: ${c.dominantIdea}`,
    `Primary hook (Tier 1): ${c.hook}`,
    `Proof/offer zone (Tier 2): ${c.proofZone}`,
    `CTA reference (optional): ${resolveCtaLine(contract.ctaSemantics)}`,
    `Invariant identity: campaign=${c.invariantIdentity.campaign}; brand=${c.invariantIdentity.brand}; product=${c.invariantIdentity.product}; palette=${c.invariantIdentity.palette}; people=${peopleLabel}`,
    "",
    "OBJECTIVE INTEGRITY: brand, product, price, conditions, dates, claims, and target format must remain correct.",
    "CTA PRESENCE: optional. Preserve the intended action when a CTA is rendered; literal wording is not required.",
    "COPY: Facts are fixed; headline and supporting expression are flexible and may be rewritten, condensed, or omitted.",
    `REFERENCE FIDELITY: ${policy.fidelityLevel}. Visual-system recognition governs permitted distance.`,
    "ADVISORY HEURISTICS: three zones, whitespace, safe margins, and thumbnail checks may guide composition but never override art direction.",
    "",
    "CONTENT TIERS:",
    `- Mandatory (must appear legibly): ${c.tiers.mandatory.join("; ")}`,
    `- Condensable (may merge/shrink): ${c.tiers.condensable.join("; ")}`,
    `- Decorative (may omit if hook+offer suffice): ${c.tiers.decorative.join("; ")}`,
    "",
    PRECEDENCE_RULES,
    "When mode instructions conflict with this block, this block wins.",
  ];
}
