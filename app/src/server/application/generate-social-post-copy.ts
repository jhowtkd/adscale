/**
 * Phase 5 / item 36: generate social post copy for a creative work.
 * Spend + OpenAI + persist copy; return work + CanonicalCreativeWork projection.
 */
import { independentCopyInputRevision } from "@/server/creative-work/copy-execution";
import { claimPreparationAttempt, finalizePreparationAttempt } from "@/server/repositories/creative-work-preparation";
import { freezeIndependentCopyGuidance, independentCopyFingerprint, persistIndependentCopy } from "@/server/repositories/copy-guidance";

import { composerHref } from "@/lib/studio/composer-href";
import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import type { CanonicalCreativeWork } from "@/server/creative-work/canonical/types";
import { generateSocialPostCopy as generateCopy } from "@/server/creative-work/copy";
import type { SocialPostCopy } from "@/server/creative-work/contracts";
import { spend, type SpendResult } from "@/server/billing/paywall";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getCreativeWork } from "@/server/repositories/creative-work";
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
  | { code: "preparation_in_progress"; details: { attemptId: string } }
  | { code: "stale_input" }
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

  const fingerprint = independentCopyFingerprint(input.workItemId);
  const inputRevision = independentCopyInputRevision(existing.work);
  const claim = await claimPreparationAttempt({ ...input, kind: "creative_prepare",
    inputRevision, inputFingerprint: fingerprint, leaseSeconds: 180 });
  // An equivalent copy call is already running: follow it instead of reporting an outage.
  if (claim.outcome === "joined") {
    return { ok: false, error: { code: "preparation_in_progress", details: { attemptId: claim.attempt.id } } };
  }
  if (claim.outcome === "revision_changed") return { ok: false, error: { code: "stale_input" } };
  // Best effort: a failed attempt must not stay running and block the retry until its lease expires.
  const fail = async () => {
    try {
      const current = await getCreativeWork(input.workspaceId, input.workItemId);
      await finalizePreparationAttempt({ ...input, attemptId: claim.attempt.id,
        currentRevision: current ? independentCopyInputRevision(current.work) : "", currentFingerprint: fingerprint, state: "failed" });
    } catch { /* The lease still expires on its own. */ }
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
    await fail();
    // Provider failure after spend: keep row; idempotency covers retry.
    return { ok: false, error: { code: "provider_unavailable" } };
  }

  let work: CreativeWorkItem | null;
  try {
    work = await persistIndependentCopy({ ...input, attemptId: claim.attempt.id,
      inputRevision, executionId, copy });
  } catch (error) {
    await fail();
    throw error;
  }
  if (!work) {
    await fail();
    return { ok: false, error: { code: "provider_unavailable" } };
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
