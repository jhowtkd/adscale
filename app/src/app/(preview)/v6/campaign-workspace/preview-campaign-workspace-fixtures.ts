import type { CampaignWorkspaceV6Labels, CampaignWorkspaceV6ViewModel } from "@/components/campaigns/v6/workspace/campaign-workspace-v6-types";
import { previewWorkspace } from "../_fixtures/preview-data";

export const previewCampaignWorkspaceLabels: CampaignWorkspaceV6Labels = {
  backToCampaigns: "Voltar para campanhas",
  sendFeedback: "Enviar feedback",
  deleteCampaign: "Excluir campanha",
  stagesAria: "Estágios da campanha",
  briefingTitle: "Briefing",
  briefingVersion: "v1",
  rulesTitle: "Regras",
  derivationsTitle: "Derivações",
  viewAllDerivations: "Ver todas →",
  openDerivation: "Abrir",
  moreOptionsFor: (title) => `Mais opções para ${title}`,
};

export const previewCampaignWorkspaceView: CampaignWorkspaceV6ViewModel = {
  name: previewWorkspace.name,
  status: previewWorkspace.status,
  statusVariant: previewWorkspace.statusClass,
  meta: previewWorkspace.meta,
  currentStage: previewWorkspace.currentStage,
  stages: [...previewWorkspace.stages],
  stageTabs: ["briefing", "generate", "export"],
  briefingSliders: previewWorkspace.briefingSliders.map((slider) => ({ ...slider })),
  briefingRules: [...previewWorkspace.briefingRules],
  derivations: previewWorkspace.derivations.map((derivation, index) => ({
    id: `preview-derivation-${index}`,
    art: derivation.art,
    title: derivation.title,
    variations: derivation.variations,
    version: derivation.version,
    score: derivation.score,
    status: derivation.status,
    statusVariant: derivation.statusClass,
    gradient: derivation.gradient,
  })),
};
