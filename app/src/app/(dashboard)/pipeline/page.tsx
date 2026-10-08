import { requireWorkspaceAccess } from "@/server/auth/workspace";
import PipelineView from "@/components/equipe/PipelineView";

export default async function PipelinePage() {
  await requireWorkspaceAccess();
  return <PipelineView />;
}
