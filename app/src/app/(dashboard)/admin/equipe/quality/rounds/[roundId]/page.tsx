import { requireEquipeStaffPage } from "@/server/equipe/http/staff-page-guard";
import RoundDetail from "@/components/equipe/RoundDetail";

export default async function EquipeRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string }>;
  searchParams: Promise<{ workspaceId?: string; accountId?: string }>;
}) {
  await requireEquipeStaffPage();
  const { roundId } = await params;
  const { workspaceId, accountId } = await searchParams;
  return (
    <RoundDetail
      roundId={roundId}
      workspaceId={typeof workspaceId === "string" ? workspaceId : ""}
      accountId={typeof accountId === "string" ? accountId : ""}
    />
  );
}
