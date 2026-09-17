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
import {
  resolveCreativeWorkFactPack,
  type SocialPostCopy,
} from "@/server/creative-work/contracts";
import { validateSocialPostCopyAgainstFactPack } from "@/server/creative-work/fact-pack";
import {
  createIdentitySnapshot,
  IdentitySnapshotMissingAlphaError,
  IdentitySnapshotMissingReferenceError,
} from "@/server/creative-work/identity";
import { resolveQualityFeaturePolicy } from "@/server/creative-work/quality-policy";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import type { CreativeWorkItem } from "@/server/db/schema";
import {
  confirmCreativeWorkIdentity,
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import { env } from "@/server/validation/env";

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
  | { code: "work_not_prepared" }
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
      title: work.title,
      toolKind: work.toolKind,
      status: work.status,
      format: work.format,
      brief: work.brief,
      inputSnapshot: work.inputSnapshot,
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
  if (!existing.work.brief) {
    return { ok: false, error: { code: "work_not_prepared" } };
  }

  const copy = resolveCopyWrite(input, existing.work.copy);
  if (!copy) {
    return { ok: false, error: { code: "invalid_copy" } };
  }

  // Peça Única copy is operator-editable, so enforce the same frozen fact
  // contract here as the generated-copy path before persisting it.
  if (existing.work.toolKind === "single") {
    const factPack = resolveCreativeWorkFactPack(existing.work.inputSnapshot);
    if (factPack && validateSocialPostCopyAgainstFactPack(copy, factPack).length > 0) {
      return { ok: false, error: { code: "invalid_copy" } };
    }
  }

  await setCreativeWorkCopy(input.workspaceId, input.workItemId, copy);

  let snapshot;
  try {
    snapshot = await createIdentitySnapshot({
      workspaceId: input.workspaceId,
      clientProfileId: existing.work.clientProfileId,
      // An explicit operator choice still wins; brief + format only steer the
      // ranked fallback when the operator picked nothing (#178).
      selectedReferenceIds: input.selectedReferenceIds,
      brief: existing.work.brief,
      format: existing.work.format,
      // ICE-05B: decided through the single resolver (social_post never
      // includes published knowledge, whatever the switch says).
      includePublishedBrandKnowledge: resolveQualityFeaturePolicy({
        feature: "brand_cortex_single",
        workspaceId: input.workspaceId,
        toolKind: existing.work.toolKind,
        snapshot: null,
        switches: {
          qualityRecovery: env.CREATIVE_WORK_QUALITY_RECOVERY_ENABLED,
          brandCortex: env.BRAND_CORTEX_SINGLE_PIECE_ENABLED,
        },
        allowlistRaw: env.BRAND_CORTEX_PILOT_WORKSPACES,
      }).includePublishedBrandKnowledge,
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
