import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import GoalsView from "@/components/equipe/GoalsView";

export default async function GoalsPage() {
  const { workspace } = await requireWorkspaceAccess();
  if (!isEquipeEnabledForWorkspace(workspace.id)) notFound();
  return <GoalsView />;
}
