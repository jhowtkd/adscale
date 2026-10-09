import { requireWorkspaceAccess } from "@/server/auth/workspace";
import GoalsView from "@/components/equipe/GoalsView";

export default async function GoalsPage() {
  await requireWorkspaceAccess();
  return <GoalsView />;
}
