import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import PipelineView from "@/components/equipe/PipelineView";

export default async function PipelinePage() {
  const { workspace } = await requireWorkspaceAccess();
  if (!isEquipeEnabledForWorkspace(workspace.id)) notFound();
  return <PipelineView />;
}
