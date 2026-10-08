import { requireWorkspaceAccess } from "@/server/auth/workspace";
import IdeasView from "@/components/equipe/IdeasView";

export default async function IdeasPage() {
  await requireWorkspaceAccess();
  return <IdeasView />;
}
