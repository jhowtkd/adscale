import { requireEquipeStaffPage } from "@/server/equipe/http/staff-page-guard";
import ExceptionsQueue from "@/components/equipe/ExceptionsQueue";

export default async function EquipeExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string; accountId?: string }>;
}) {
  await requireEquipeStaffPage();
  const { workspaceId, accountId } = await searchParams;
  return (
    <ExceptionsQueue
      workspaceId={typeof workspaceId === "string" ? workspaceId : null}
      accountId={typeof accountId === "string" ? accountId : null}
    />
  );
}
