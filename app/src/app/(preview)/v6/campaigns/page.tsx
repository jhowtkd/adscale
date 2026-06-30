import CampaignsV6View from "@/components/campaigns/v6/CampaignsV6View";
import { previewCampaignsLabels, previewCampaignsRows } from "./preview-campaigns-fixtures";

export default function CampaignsPreviewPage() {
  return (
    <CampaignsV6View
      labels={previewCampaignsLabels}
      rows={previewCampaignsRows}
      totalCount={12}
      interactive={false}
      searchQuery=""
      statusFilter="all"
      statusFilterLabel="Todos"
      statusOptions={[]}
      platformFilter="all"
      platformFilterLabel="Todas"
      platformOptions={[]}
      sortOption="newest"
      sortLabel="Atualização"
      sortOptions={[]}
      viewMode="list"
    />
  );
}
