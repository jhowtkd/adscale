import DashboardV6View from "@/components/dashboard/v6/DashboardV6View";
import { previewDashboardLabels, previewDashboardView } from "./preview-dashboard-fixtures";

export default function DashboardPreviewPage() {
  return (
    <DashboardV6View
      view={previewDashboardView}
      labels={previewDashboardLabels}
      summary={
        <>
          Você tem <strong className="text-[var(--text-primary)]">3 campanhas em revisão</strong> e{" "}
          <strong className="text-[var(--accent-primary-text)]">2 derivações prontas pra aprovar</strong>.
        </>
      }
      interactive={false}
    />
  );
}
