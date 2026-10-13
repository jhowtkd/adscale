/**
 * Phase 5 / item 36: generate social post copy for a creative work.
 * Spend + OpenAI + persist copy; return work + CanonicalCreativeWork projection.
 */
import { preparationInputFingerprint } from "@/server/creative-work/preparation-attempt";
import { claimPreparationAttempt, finalizePreparationAttempt } from "@/server/repositories/creative-work-preparation";
import { freezeIndependentCopyGuidance } from "@/server/repositories/copy-guidance";

import { composerHref } from "@/lib/studio/composer-href";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import { generateSocialPostCopy as generateCopy } from "@/server/creative-work/copy";
import type { SocialPostCopy } from "@/server/creative-work/contracts";
import { spend, type SpendResult } from "@/server/billing/paywall";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";
import {
  getCreativeWork,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import type { CreativeWorkItem } from "@/server/db/schema";

export type GenerateSocialPostCopyInput = {
  workspaceId: string;
  workItemId: string;
  userId: string;
  returnPath?: string;
};

export type GenerateSocialPostCopyError =
  | { code: "work_not_found" }
  | { code: "work_not_prepared" }
  | { code: "client_profile_not_found" }
  | { code: "credit_blocked"; spend: Extract<SpendResult, { ok: false }> }
  | { code: "provider_unavailable" };

export type GenerateSocialPostCopySuccess = {
  copy: SocialPostCopy;
  work: CreativeWorkItem;
  canonical: CanonicalCreativeWork;
};

export type GenerateSocialPostCopyResult =
  | { ok: true; value: GenerateSocialPostCopySuccess }
  | { ok: false; error: GenerateSocialPostCopyError };

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

export async function generateSocialPostCopy(
  input: GenerateSocialPostCopyInput
): Promise<GenerateSocialPostCopyResult> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) {
    return { ok: false, error: { code: "work_not_found" } };
  }
  if (!existing.work.brief) {
    return { ok: false, error: { code: "work_not_prepared" } };
  }

  // Repeat request: short-circuit without spend or OpenAI.
  if (existing.work.copy) {
    return {
      ok: true,
      value: {
        copy: existing.work.copy,
        work: existing.work,
        canonical: toCanonical(existing.work, existing.outputs),
      },
    };
  }

  const spendResult = await spend({
    workspaceId: input.workspaceId,
    action: "copy_generation",
    idempotencyKey: `creative-work:${input.workItemId}:copy`,
    metadata: {
      creativeWorkId: input.workItemId,
      operation_key: "copy_generation",
    },
    userId: input.userId,
    returnPath: input.returnPath ?? composerHref({ workId: input.workItemId }),
  });
  if (!spendResult.ok) {
    return {
      ok: false,
      error: { code: "credit_blocked", spend: spendResult },
    };
  }

  const profile = await getClientProfile(
    input.workspaceId,
    existing.work.clientProfileId
  );
  if (!profile) {
    return { ok: false, error: { code: "client_profile_not_found" } };
  }

  const brandKit = await getBrandKit(
    input.workspaceId,
    existing.work.clientProfileId
  );

  const fingerprint = preparationInputFingerprint({ executionKey: `creative-work:${input.workItemId}:copy` });
  const claim = await claimPreparationAttempt({ ...input, kind: "creative_prepare",
    inputRevision: existing.work.updatedAt.toISOString(), inputFingerprint: fingerprint, leaseSeconds: 180 });
  if (claim.outcome !== "claimed") return { ok: false, error: { code: "provider_unavailable" } };
  const finish = async (state: "completed" | "failed") => {
    const current = await getCreativeWork(input.workspaceId, input.workItemId);
    return finalizePreparationAttempt({ ...input, attemptId: claim.attempt.id,
      currentRevision: current?.work.updatedAt.toISOString() ?? "", currentFingerprint: fingerprint, state });
  };
  let executionId = claim.attempt.id;
  let copy: SocialPostCopy;
  try {
    const frozen = await freezeIndependentCopyGuidance({ ...input, attemptId: claim.attempt.id });
    executionId = frozen?.preparation?.executionId ?? claim.attempt.id;
    const factPack = existing.work.inputSnapshot?.factPack;
    const sourceAuthority = factPack?.identity.brandAuthority === "source";
    copy = await generateCopy({
      brief: existing.work.brief,
      guidance: sourceAuthority
        ? { lines: [], appliedRefs: [], setHash: null, omissions: [], omissionReason: "brand_out_of_scope" }
        : frozen?.roles.copy,
      applicationScope: { workspaceId: input.workspaceId, workItemId: input.workItemId, executionId },
      brandName: profile.name,
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      toneNotes: brandKit?.toneNotes ?? null,
      description: brandKit?.description ?? null,
      constraints: brandKit?.constraints ?? null,
      requiredElements: brandKit?.requiredElements ?? null,
      prohibitedElements: brandKit?.prohibitedElements ?? null,
    });
  } catch {
    await finish("failed");
    // Provider failure after spend: keep row; idempotency covers retry.
    return { ok: false, error: { code: "provider_unavailable" } };
  }

  const finalized = await finish("completed");
  if (!finalized.ok) return { ok: false, error: { code: "provider_unavailable" } };
  const work = await setCreativeWorkCopy(
    input.workspaceId,
    input.workItemId,
    copy,
    executionId,
    existing.work.updatedAt
  );
  if (!work) {
    return { ok: false, error: { code: "work_not_found" } };
  }

  return {
    ok: true,
    value: {
      copy,
      work,
      canonical: toCanonical(work, existing.outputs),
    },
  };
}
