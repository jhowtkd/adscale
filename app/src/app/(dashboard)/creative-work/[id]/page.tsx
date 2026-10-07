import { redirect } from "next/navigation";
import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { composerReturnHref, NEW_CREATIVE_WORK_ID, type PageSearchParams } from "@/lib/studio/composer-href";
import { AUTH_ERROR_CODES, isWorkspaceAuthError, requireWorkspaceAccess } from "@/server/auth/workspace";
import { env } from "@/server/validation/env";
import { studioStageProps } from "../../studio-stage-props";

export default async function CreativeWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<PageSearchParams>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  // Spec 2026-10-07 §2: `/creative-work/new` is the Studio stage, the composer that lived at `/`, in either shell.
  if (id === NEW_CREATIVE_WORK_ID) {
    let access;
    try {
      access = await requireWorkspaceAccess();
    } catch (error) {
      if (!isWorkspaceAuthError(error) || error.code !== AUTH_ERROR_CODES.unauthorized) throw error;
      const callbackUrl = composerReturnHref(query);
      redirect(`/login?${new URLSearchParams({ callbackUrl })}`);
    }
    return <DashboardHomeActions {...studioStageProps(access.workspace.id, query)} />;
  }
  return (
    <CreativeWorkResumeSurface
      workId={id}
      threeFourCreationEnabled={env.CREATIVE_WORK_34_CREATION_ENABLED === "true"}
    />
  );
}
