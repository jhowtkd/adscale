import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { resolveStudioRolloutVariant } from "@/server/studio-rollout";
import { env } from "@/server/validation/env";
import { parseDashboardSearchParams } from "./dashboard-search-params";

type DashboardSearchParams = Record<string, string | string[] | undefined>;

export default async function DashboardPage({ searchParams }: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const { workspace } = await requireWorkspaceAccess();
  return <DashboardHomeActions
    {...parseDashboardSearchParams(await searchParams)}
    workspaceId={workspace.id}
    rolloutVariant={resolveStudioRolloutVariant(workspace.id, env.STUDIO_PROGRESSIVE_ROLLOUT_PERCENT)}
  />;
}
