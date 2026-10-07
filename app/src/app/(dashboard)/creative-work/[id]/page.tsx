import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { NEW_CREATIVE_WORK_ID } from "@/lib/studio/composer-href";
import { requireWorkspaceAccess } from "@/server/auth/workspace";
import { env } from "@/server/validation/env";
import { studioStageProps } from "../../studio-stage-props";

type CreativeWorkSearchParams = Record<string, string | string[] | undefined>;

export default async function CreativeWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<CreativeWorkSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Spec 2026-10-07 §2: `/creative-work/new` is the Studio stage, the composer that lived at `/`, in either shell.
  if (id === NEW_CREATIVE_WORK_ID) {
    const { workspace } = await requireWorkspaceAccess();
    return <DashboardHomeActions {...studioStageProps(workspace.id, query)} />;
  }
  return (
    <CreativeWorkResumeSurface
      workId={id}
      threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
    />
  );
}
