/**
 * Phase 5 / item 34–35: start Criar Post as a canonical creative work.
 *
 * - Intent is always preconfigured as `social_post` (not campaign).
 * - No campaign row is created or required.
 * - Returns the persistence row plus the shared CanonicalCreativeWork projection
 *   so create, list, and open can share the same contract.
 */
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import type {
  SocialPostBrief,
} from "@/server/creative-work/contracts";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  createCreativeWork,
  type CreativeWorkFormat,
  type CreateCreativeWorkInput,
} from "@/server/repositories/creative-work";
import type { CreativeWorkItem } from "@/server/db/schema";

/** Fixed intent for the short Criar Post path (item 34). */
export const SOCIAL_POST_TOOL_KIND = "social_post" as const;

export type StartSocialPostWorkInput = {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  format: CreativeWorkFormat;
  brief: SocialPostBrief;
};

export type StartSocialPostWorkError =
  | { code: "client_profile_not_found" };

export type StartSocialPostWorkSuccess = {
  work: CreativeWorkItem;
  /** Origin-agnostic view with intent.kind === "social_post". */
  canonical: CanonicalCreativeWork;
};

export type StartSocialPostWorkResult =
  | { ok: true; value: StartSocialPostWorkSuccess }
  | { ok: false; error: StartSocialPostWorkError };

export function buildSocialPostCreateInput(
  input: StartSocialPostWorkInput
): CreateCreativeWorkInput {
  return {
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.userId,
    // Always social_post — clients cannot start another toolKind here.
    toolKind: SOCIAL_POST_TOOL_KIND,
    brief: input.brief,
    format: input.format,
  };
}

export async function startSocialPostWork(
  input: StartSocialPostWorkInput
): Promise<StartSocialPostWorkResult> {
  const profile = await getClientProfile(
    input.workspaceId,
    input.clientProfileId
  );
  if (!profile) {
    return { ok: false, error: { code: "client_profile_not_found" } };
  }

  const work = await createCreativeWork(buildSocialPostCreateInput(input));

  const canonical = projectCreativeWorkAsCanonicalWork(
    {
      id: work.id,
      workspaceId: work.workspaceId,
      clientProfileId: work.clientProfileId,
      toolKind: work.toolKind,
      status: work.status,
      format: work.format,
      brief: work.brief,
      copy: work.copy,
      identitySnapshot: work.identitySnapshot,
      createdAt: work.createdAt,
      updatedAt: work.updatedAt,
    },
    []
  );

  // Invariants for Phase 5 create path.
  if (canonical.intent.kind !== "social_post") {
    throw new Error(
      `startSocialPostWork: expected intent.kind social_post, got ${canonical.intent.kind}`
    );
  }
  if (canonical.originKind !== "creative_work") {
    throw new Error(
      `startSocialPostWork: expected originKind creative_work, got ${canonical.originKind}`
    );
  }

  return { ok: true, value: { work, canonical } };
}
