import { requireEquipeStaffPage } from "@/server/equipe/http/staff-page-guard";
import EscalationDetail from "@/components/equipe/EscalationDetail";

export default async function EquipeEscalationPage({
  params,
  searchParams,
}: {
  params: Promise<{ escalationId: string }>;
  searchParams: Promise<{ workspaceId?: string; accountId?: string }>;
}) {
  await requireEquipeStaffPage();
  const { escalationId } = await params;
  const { workspaceId, accountId } = await searchParams;
  return (
    <EscalationDetail
      escalationId={escalationId}
      workspaceId={typeof workspaceId === "string" ? workspaceId : ""}
      accountId={typeof accountId === "string" ? accountId : ""}
    />
  );
}
