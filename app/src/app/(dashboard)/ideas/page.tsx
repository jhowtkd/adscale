import { notFound } from "next/navigation";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { isEquipeEnabledForWorkspace } from "@/server/equipe/module/equipe-enabled";
import IdeasView from "@/components/equipe/IdeasView";

export default async function IdeasPage() {
  const { workspace } = await requireWorkspaceAccess();
  if (!isEquipeEnabledForWorkspace(workspace.id)) notFound();
  return <IdeasView />;
}
