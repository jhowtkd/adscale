import type {
  ProgressionEvidenceKey,
  ProgressionLevelKey,
  ProgressionNextAction,
} from "@/lib/progression/types";

export const EVIDENCE_ORDER: ProgressionEvidenceKey[] = [
  "campaign_created",
  "base_creative_uploaded",
  "readiness_ran",
  "derivation_generated",
  "creative_approved",
  "creative_exported",
  "share_created",
];

export interface LevelDefinition {
  key: ProgressionLevelKey;
  /**
   * Structural label kept for backward compatibility with the API response shape.
   * Human-readable copy is resolved on the client via
   * `dashboard.progression.levels.<key>.{label,shortLabel,description}`.
   */
  label: string;
  shortLabel: string;
  description: string;
  requiredEvidence: ProgressionEvidenceKey[];
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  {
    key: "aprendiz",
    label: "",
    shortLabel: "",
    description: "",
    requiredEvidence: [],
  },
  {
    key: "analista_criativo",
    label: "",
    shortLabel: "",
    description: "",
    requiredEvidence: ["creative_approved"],
  },
  {
    key: "estrategista_ads",
    label: "",
    shortLabel: "",
    description: "",
    requiredEvidence: ["creative_approved", "derivation_generated", "creative_exported"],
  },
  {
    key: "cientista_ads",
    label: "",
    shortLabel: "",
    description: "",
    requiredEvidence: [
      "campaign_created",
      "base_creative_uploaded",
      "readiness_ran",
      "derivation_generated",
      "creative_approved",
      "creative_exported",
      "share_created",
    ],
  },
];

export interface EvidenceDefinition {
  key: ProgressionEvidenceKey;
  /**
   * Structural label kept for backward compatibility with the API response shape.
   * Human-readable copy is resolved on the client via
   * `dashboard.progression.evidence.<key>.{label,description}`.
   */
  label: string;
  description: string;
  defaultHref: string;
  prerequisite?: ProgressionEvidenceKey;
  blockedReason?: string;
}

export const EVIDENCE_DEFINITIONS: Record<ProgressionEvidenceKey, EvidenceDefinition> = {
  campaign_created: {
    key: "campaign_created",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
  },
  base_creative_uploaded: {
    key: "base_creative_uploaded",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "campaign_created",
    blockedReason: "",
  },
  readiness_ran: {
    key: "readiness_ran",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "base_creative_uploaded",
    blockedReason: "",
  },
  derivation_generated: {
    key: "derivation_generated",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "readiness_ran",
    blockedReason: "",
  },
  creative_approved: {
    key: "creative_approved",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "derivation_generated",
    blockedReason: "",
  },
  creative_exported: {
    key: "creative_exported",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "creative_approved",
    blockedReason: "",
  },
  share_created: {
    key: "share_created",
    label: "",
    description: "",
    defaultHref: "/campaigns/new",
    prerequisite: "creative_approved",
    blockedReason: "",
  },
};

export function getLevelDefinition(key: ProgressionLevelKey): LevelDefinition {
  const level = LEVEL_DEFINITIONS.find((item) => item.key === key);
  if (!level) {
    throw new Error(`Unknown progression level: ${key}`);
  }
  return level;
}

export function calculateLevel(
  completedKeys: Set<ProgressionEvidenceKey>
): ProgressionLevelKey {
  let current: ProgressionLevelKey = "aprendiz";

  for (const level of LEVEL_DEFINITIONS.slice(1)) {
    const meetsRequirements = level.requiredEvidence.every((key) => completedKeys.has(key));
    if (meetsRequirements) {
      current = level.key;
    } else {
      break;
    }
  }

  if (!completedKeys.has("creative_approved") && current !== "aprendiz") {
    return "aprendiz";
  }

  return current;
}

export function calculateProgressPercent(
  completedKeys: Set<ProgressionEvidenceKey>
): number {
  const completedCount = EVIDENCE_ORDER.filter((key) => completedKeys.has(key)).length;
  return Math.round((completedCount / EVIDENCE_ORDER.length) * 100);
}

export function buildNextAction(
  completedKeys: Set<ProgressionEvidenceKey>,
  hrefOverrides: Partial<Record<ProgressionEvidenceKey, string>> = {}
): ProgressionNextAction {
  for (const key of EVIDENCE_ORDER) {
    if (completedKeys.has(key)) continue;

    const definition = EVIDENCE_DEFINITIONS[key];
    const prerequisiteMissing =
      definition.prerequisite !== undefined && !completedKeys.has(definition.prerequisite);

    return {
      key,
      label: definition.label,
      description: definition.description,
      href: hrefOverrides[key] ?? definition.defaultHref,
      blocked: prerequisiteMissing,
      blockedReason: prerequisiteMissing ? definition.blockedReason : undefined,
    };
  }

  const last = EVIDENCE_DEFINITIONS.share_created;
  return {
    key: "share_created",
    label: last.label,
    description: "",
    href: hrefOverrides.share_created ?? last.defaultHref,
    blocked: false,
  };
}
