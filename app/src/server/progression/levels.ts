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
  label: string;
  shortLabel: string;
  description: string;
  requiredEvidence: ProgressionEvidenceKey[];
}

export const LEVEL_DEFINITIONS: LevelDefinition[] = [
  {
    key: "aprendiz",
    label: "Aprendiz de Laboratorio",
    shortLabel: "Aprendiz",
    description: "Monte seu laboratorio e faca seu primeiro experimento criativo.",
    requiredEvidence: [],
  },
  {
    key: "analista_criativo",
    label: "Analista Criativo",
    shortLabel: "Analista",
    description: "Voce ja aprovou um criativo real e entende o fluxo basico.",
    requiredEvidence: ["creative_approved"],
  },
  {
    key: "estrategista_ads",
    label: "Estrategista de Ads",
    shortLabel: "Estrategista",
    description: "Gera, aprova e exporta variacoes com consistencia estrategica.",
    requiredEvidence: ["creative_approved", "derivation_generated", "creative_exported"],
  },
  {
    key: "cientista_ads",
    label: "Cientista de Ads",
    shortLabel: "Cientista",
    description: "Domina o ciclo completo: briefing, geracao, aprovacao, export e compartilhamento.",
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
  label: string;
  description: string;
  defaultHref: string;
  prerequisite?: ProgressionEvidenceKey;
  blockedReason?: string;
}

export const EVIDENCE_DEFINITIONS: Record<ProgressionEvidenceKey, EvidenceDefinition> = {
  campaign_created: {
    key: "campaign_created",
    label: "Primeira campanha",
    description: "Crie sua primeira campanha para iniciar um experimento.",
    defaultHref: "/campaigns/new",
  },
  base_creative_uploaded: {
    key: "base_creative_uploaded",
    label: "Criativo base enviado",
    description: "Envie o criativo base que servira de referencia para variacoes.",
    defaultHref: "/campaigns/new",
    prerequisite: "campaign_created",
    blockedReason: "Crie uma campanha antes de enviar o criativo base.",
  },
  readiness_ran: {
    key: "readiness_ran",
    label: "Analise de prontidao",
    description: "Rode a analise de prontidao para entender o potencial do criativo.",
    defaultHref: "/campaigns/new",
    prerequisite: "base_creative_uploaded",
    blockedReason: "Envie um criativo base antes de rodar a analise de prontidao.",
  },
  derivation_generated: {
    key: "derivation_generated",
    label: "Variacoes geradas",
    description: "Gere suas primeiras variacoes a partir do criativo base.",
    defaultHref: "/campaigns/new",
    prerequisite: "readiness_ran",
    blockedReason: "Complete a analise de prontidao antes de gerar variacoes.",
  },
  creative_approved: {
    key: "creative_approved",
    label: "Criativo aprovado",
    description: "Aprove pelo menos uma variacao para validar o experimento.",
    defaultHref: "/campaigns/new",
    prerequisite: "derivation_generated",
    blockedReason: "Gere variacoes antes de aprovar um criativo.",
  },
  creative_exported: {
    key: "creative_exported",
    label: "Criativo exportado",
    description: "Exporte um criativo aprovado para uso nas plataformas.",
    defaultHref: "/campaigns/new",
    prerequisite: "creative_approved",
    blockedReason: "Aprove um criativo antes de exportar.",
  },
  share_created: {
    key: "share_created",
    label: "Link de compartilhamento",
    description: "Compartilhe resultados com cliente ou equipe.",
    defaultHref: "/campaigns/new",
    prerequisite: "creative_approved",
    blockedReason: "Aprove um criativo antes de compartilhar.",
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
    description: "Voce completou todos os experimentos disponiveis. Continue refinando campanhas.",
    href: hrefOverrides.share_created ?? last.defaultHref,
    blocked: false,
  };
}
