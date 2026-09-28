import { requireEquipeStaffPage } from "@/server/equipe/http/staff-page-guard";
import QualityPipeline from "@/components/equipe/QualityPipeline";

export default async function EquipeQualityPage() {
  await requireEquipeStaffPage();
  return <QualityPipeline />;
}
