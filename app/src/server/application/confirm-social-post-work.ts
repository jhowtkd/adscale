/**
 * Phase 5 / item 36: confirm social post — persist copy via CanonicalBriefing
 * map, lock identity snapshot, transition to ready.
 */
import {
  socialPostCopyToBriefingWrite,
  toSocialPostCopy,
  type CanonicalBriefingWrite,
} from "@/server/creative-work/canonical/briefing-persist";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import type { SocialPostCopy } from "@/server/creative-work/contracts";
import {
  createIdentitySnapshot,
  IdentitySnapshotMissingAlphaError,
  IdentitySnapshotMissingReferenceError,
} from "@/server/creative-work/identity";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import type { CreativeWorkItem } from "@/server/db/schema";
import {
  confirmCreativeWorkIdentity,
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";

export type ConfirmSocialPostWorkInput = {
  workspaceId: string;
  workItemId: string;
  selectedReferenceIds: string[];
  /**
   * Prefer `briefing` (canonical). `copy` kept for wizard HTTP compat —
   * both map through toSocialPostCopy before persist.
   */
  briefing?: CanonicalBriefingWrite;
  copy?: SocialPostCopy;
};

export type ConfirmSocialPostWorkError =
  | { code: "work_not_found" }
  | { code: "invalid_copy" }
  | {
      code: "identity_reference_not_approved";
      referenceId: string;
    }
  | {
      code: "identity_reference_missing_alpha";
      referenceId: string;
      category: string;
    };

export type ConfirmSocialPostWorkSuccess = {
  work: CreativeWorkItem;
  canonical: CanonicalCreativeWork;
};

export type ConfirmSocialPostWorkResult =
  | { ok: true; value: ConfirmSocialPostWorkSuccess }
  | { ok: false; error: ConfirmSocialPostWorkError };

function toCanonical(
  work: CreativeWorkItem,
  outputs: Parameters<typeof projectCreativeWorkAsCanonicalWork>[1] = []
): CanonicalCreativeWork {
  return projectCreativeWorkAsCanonicalWork(
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
    outputs
  );
}

function resolveCopyWrite(
  input: ConfirmSocialPostWorkInput,
  existingCopy: SocialPostCopy | null
): SocialPostCopy | null {
  const write: CanonicalBriefingWrite = {
    ...(input.copy ? socialPostCopyToBriefingWrite(input.copy) : {}),
    ...input.briefing,
  };
  if (
    write.headline == null &&
    write.body == null &&
    write.cta == null &&
    !existingCopy
  ) {
    return null;
  }
  try {
    return toSocialPostCopy(write, existingCopy);
  } catch {
    return null;
  }
}

export async function confirmSocialPostWork(
  input: ConfirmSocialPostWorkInput
): Promise<ConfirmSocialPostWorkResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }

  const copy = resolveCopyWrite(input, existing.work.copy);
  if (!copy) {
    return { ok: false, error: { code: "invalid_copy" } };
  }

  await setCreativeWorkCopy(input.workspaceId, input.workItemId, copy);

  let snapshot;
  try {
    snapshot = await createIdentitySnapshot({
      workspaceId: input.workspaceId,
      clientProfileId: existing.work.clientProfileId,
      selectedReferenceIds: input.selectedReferenceIds,
    });
  } catch (error) {
    if (error instanceof IdentitySnapshotMissingReferenceError) {
      return {
        ok: false,
        error: {
          code: "identity_reference_not_approved",
          referenceId: error.missingId,
        },
      };
    }
    if (error instanceof IdentitySnapshotMissingAlphaError) {
      return {
        ok: false,
        error: {
          code: "identity_reference_missing_alpha",
          referenceId: error.referenceId,
          category: error.category,
        },
      };
    }
    throw error;
  }

  const work = await confirmCreativeWorkIdentity(
    input.workspaceId,
    input.workItemId,
    snapshot
  );
  if (!work) {
    return { ok: false, error: { code: "work_not_found" } };
  }

  return {
    ok: true,
    value: {
      work,
      canonical: toCanonical(work, existing.outputs),
    },
  };
}
