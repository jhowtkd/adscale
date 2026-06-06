import type { MissionKey } from "@/lib/progression/missions/types";
import type { ProgressionEvidenceKey } from "@/lib/progression/types";

export const MISSION_ORDER: MissionKey[] = [
  "setup",
  "upload",
  "readiness",
  "guided_briefing",
  "strategy_recipe",
  "preview",
  "batch",
  "review",
  "regeneration",
  "export",
  "share",
];

export interface MissionDefinition {
  key: MissionKey;
  prerequisite?: MissionKey;
  blockedReason?: string;
  /** Maps to progression evidence when the mission aligns 1:1 */
  progressionEvidence?: ProgressionEvidenceKey;
}

export const MISSION_DEFINITIONS: Record<MissionKey, MissionDefinition> = {
  setup: {
    key: "setup",
    progressionEvidence: "campaign_created",
  },
  upload: {
    key: "upload",
    prerequisite: "setup",
    blockedReason: "Crie uma campanha antes de enviar o criativo base.",
    progressionEvidence: "base_creative_uploaded",
  },
  readiness: {
    key: "readiness",
    prerequisite: "upload",
    blockedReason: "Envie um criativo base antes de rodar a analise de prontidao.",
    progressionEvidence: "readiness_ran",
  },
  guided_briefing: {
    key: "guided_briefing",
    prerequisite: "readiness",
    blockedReason: "Complete a analise de prontidao antes de estruturar o briefing.",
  },
  strategy_recipe: {
    key: "strategy_recipe",
    prerequisite: "guided_briefing",
    blockedReason: "Complete o briefing guiado antes de escolher a receita estrategica.",
  },
  preview: {
    key: "preview",
    prerequisite: "strategy_recipe",
    blockedReason: "Escolha uma receita estrategica antes de gerar o preview.",
  },
  batch: {
    key: "batch",
    prerequisite: "preview",
    blockedReason: "Gere um preview antes de rodar o lote completo.",
  },
  review: {
    key: "review",
    prerequisite: "batch",
    blockedReason: "Gere variacoes em lote antes de revisar criativos.",
  },
  regeneration: {
    key: "regeneration",
    prerequisite: "review",
    blockedReason: "Revise pelo menos um criativo antes de regenerar com feedback.",
  },
  export: {
    key: "export",
    prerequisite: "review",
    blockedReason: "Aprove um criativo antes de exportar.",
    progressionEvidence: "creative_exported",
  },
  share: {
    key: "share",
    prerequisite: "export",
    blockedReason: "Exporte um criativo antes de compartilhar.",
    progressionEvidence: "share_created",
  },
};

export function getMissionDefinition(key: MissionKey): MissionDefinition {
  const definition = MISSION_DEFINITIONS[key];
  if (!definition) {
    throw new Error(`Unknown mission key: ${key}`);
  }
  return definition;
}
