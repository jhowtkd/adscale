import { headers } from "next/headers";
import { redirect } from "next/navigation";
import DashboardHomeActions from "@/components/dashboard/DashboardHomeActions";
import { CreativeWorkResumeSurface } from "@/components/creative-work/CreativeWorkResumeSurface";
import { COMPOSER_PATH, COMPOSER_RETURN_HEADER, NEW_CREATIVE_WORK_ID } from "@/lib/studio/composer-href";
import { AUTH_ERROR_CODES, isWorkspaceAuthError, requireWorkspaceAccess } from "@/server/auth/workspace";
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
    let access;
    try {
      access = await requireWorkspaceAccess();
    } catch (error) {
      if (!isWorkspaceAuthError(error) || error.code !== AUTH_ERROR_CODES.unauthorized) throw error;
      const raw = (await headers()).get(COMPOSER_RETURN_HEADER);
      // Proxy overwrites this internal header. Still validate an exact relative pathname, never an external callback.
      const safeRaw = raw && !/[\\#\r\n]/.test(raw) && (raw === COMPOSER_PATH || raw.startsWith(`${COMPOSER_PATH}?`));
      const fallback = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        for (const entry of Array.isArray(value) ? value : [value]) fallback.append(key, entry);
      }
      const search = fallback.toString();
      const callbackUrl = safeRaw ? raw : `${COMPOSER_PATH}${search ? `?${search}` : ""}`;
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
