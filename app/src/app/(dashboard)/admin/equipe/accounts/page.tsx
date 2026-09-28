import { requireEquipeStaffPage } from "@/server/equipe/http/staff-page-guard";
import CrossAccountPipeline from "@/components/equipe/CrossAccountPipeline";

export default async function EquipeAccountsPage() {
  await requireEquipeStaffPage();
  return <CrossAccountPipeline />;
}
