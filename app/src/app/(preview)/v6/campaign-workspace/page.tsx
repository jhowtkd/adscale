import CampaignWorkspaceV6View from "@/components/campaigns/v6/workspace/CampaignWorkspaceV6View";
import {
  previewCampaignWorkspaceLabels,
  previewCampaignWorkspaceView,
} from "./preview-campaign-workspace-fixtures";

export default function CampaignWorkspacePreviewPage() {
  return (
    <CampaignWorkspaceV6View
      view={previewCampaignWorkspaceView}
      labels={previewCampaignWorkspaceLabels}
      interactive={false}
    />
  );
}
