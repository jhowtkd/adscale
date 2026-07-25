import "server-only";
import { logger } from "@/lib/logger";
import { objectStorage } from "@/server/storage";
import { isRetryableProviderError } from "@/server/ai/image-generation";
import { executeCanonicalGeneration } from "@/server/generation/pipeline/execute";
import {
  runCreativeWorkPostGeneration,
  runCreativeWorkQualityAssessment,
  type CreativeWorkPostGenerationResult,
  type CreativeWorkQualityAssessmentResult,
} from "@/server/generation/pipeline/post-generation";
import {
  GENERATION_CREDIT_COSTS,
  creativeWorkUnitBillingKey,
  type GenerationRequest,
  type RefundDecision,
} from "@/server/generation/canonical/types";
import { getClientProfile } from "@/server/repositories/client-reference";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { refundCredits } from "@/server/billing/credits";
import {
  CREATIVE_WORK_MAX_IMAGE_CALLS,
  claimCreativeWorkOutputImageCall,
  getCreativeWork,
  markCreativeWorkOutputProcessing,
  completeCreativeWorkOutput,
  failCreativeWorkOutput,
  failQueuedCreativeWorkOutput,
  refreshCreativeWorkStatus,
  requeueCreativeWorkOutputOnce,
  touchCreativeWorkOutputHeartbeat,
} from "@/server/repositories/creative-work";
import {
  buildCreativeWorkPrompt,
  buildSocialPostPrompt,
  type BuildCreativeWorkPromptInput,
  type SocialPostFormat,
} from "@/server/creative-work/prompt";
import {
  normalizeCreativeWorkReferenceImage,
  normalizedCreativeWorkReferenceName,
} from "@/server/creative-work/reference-normalize";
import {
  createCreativeWorkJobTimer,
  logCreativeWorkLateCompletionDiscarded,
  logCreativeWorkOutputStage,
  logCreativeWorkOutputTerminal,
} from "@/server/creative-work/job-telemetry";
import {
  composeExactBrandAssets,
  type BrandAssetGravity,
} from "@/server/creative-work/composite";
import { getTargetDimensions } from "@/lib/formats";
import {
  resolveCreativeWorkFactPack,
  resolveGenerationPolicyVersion,
} from "@/server/creative-work/contracts";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import {
  CreativeWorkReferenceError,
  planCreativeWorkReferences,
  type CreativeWorkReferenceRole,
  type CreativeWorkReferenceSlot,
} from "@/server/creative-work/reference-plan";
import type {
  CreativeWorkFormat,
  CreativeWorkFactPack,
  CreativeWorkIdentitySnapshot,
  SocialPostCopy,
} from "@/server/creative-work/contracts";
import type { AnalyzeCreativeWorkQaReference } from "@/server/ai/creative-qa";
import { ensureCreativeWorkOutputInLibrary } from "@/server/application/ensure-creative-work-output-library";
import { inngest } from "./client";
import {
  decideCreativeWorkRefund,
  decideJobIdempotency,
} from "@/server/generation/canonical/policies";

interface CreativeWorkGenerateEvent {
  workspaceId: string;
  workItemId: string;
  outputId: string;
}

const OUTPUT_COST = GENERATION_CREDIT_COSTS.creativeWorkOutput;
const MAX_REFERENCE_IMAGES = 4;

/**
 * Sanitize arbitrary error messages into a short, user-safe slug. The slug is
 * persisted on the output row so retry routes / UI can group failures without
 * leaking provider internals.
 */
export function sanitizeCreativeWorkFailureCode(message: string): string {
  const slug = message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  if (slug.length === 0) return "provider_failed";
  return slug;
}

export const creativeWorkOutputJob = inngest.createFunction(
  {
    id: "generate-creative-work-output",
    retries: 0,
    // R-007 / spec 12.1: at most one Creative Work image call in flight
    // during the initial rollout (account-scoped limits need a CEL key, same
    // pattern as derivationJob).
    concurrency: [{ limit: 1, scope: "account", key: `"creative-work-image"` }],
    triggers: [{ event: "creative-work.generate" }],
  },
  async ({ event, step }) => {
    const data = event.data as CreativeWorkGenerateEvent;
    const { workspaceId, workItemId, outputId } = data;
    logger.info(
      `[creativeWorkOutputJob] START workspaceId=${workspaceId} workItemId=${workItemId} outputId=${outputId}`,
    );

    // R-006/R-007 runtime state shared between the happy path and the
    // catch/terminal paths (terminal refund decision + telemetry).
    const jobTimer = createCreativeWorkJobTimer();
    let providerInvoked = false;
    let isV1Policy = false;
    let imageCallCount = 0;
    let terminalRefunded = false;

    try {
      const scopeRaw = (await step.run("load-scope", async () => {
        const result = await getCreativeWork(workspaceId, workItemId);
        if (!result) return null;
        const output = result.outputs.find((o) => o.id === outputId) ?? null;
        return {
          work: result.work,
          output,
          parentOutput: output?.parentOutputId
            ? result.outputs.find((candidate) => candidate.id === output.parentOutputId) ?? null
            : null,
        };
      })) as unknown as {
        work: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { work: infer W }
            ? W
            : never
          : never;
        output: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { outputs: infer O }
            ? O extends Array<infer Item>
              ? Item | null
              : never
            : never
            : never;
        parentOutput: Awaited<ReturnType<typeof getCreativeWork>> extends infer R
          ? R extends { outputs: infer O }
            ? O extends Array<infer Item>
              ? Item | null
              : never
            : never
          : never;
      } | null;

      if (
        !scopeRaw ||
        !scopeRaw.output ||
        !scopeRaw.work.brief ||
        !scopeRaw.work.identitySnapshot ||
        !scopeRaw.work.copy
      ) {
        logger.warn(
          `[creativeWorkOutputJob] SKIP missing scope workspaceId=${workspaceId} outputId=${outputId}`,
        );
        return { success: false, skipped: true, outputId };
      }

      const work = scopeRaw.work;
      const brief = work.brief;
      if (!brief) return { success: false, skipped: true, outputId };
      const output = scopeRaw.output;
      const creativeLevel = output.creativeLevel;
      const parentOutput = scopeRaw.parentOutput;
      const identitySnapshot = work.identitySnapshot as CreativeWorkIdentitySnapshot;
      const copy = work.copy as SocialPostCopy;

      // Idempotency: if a duplicate event arrives after the row already
      // completed, skip provider invocation entirely.
      const idempotency = decideJobIdempotency({
        surface: "quick_tool",
        outputStatus: output.status,
      });
      if (idempotency.skip) {
        logger.info(
          `[creativeWorkOutputJob] SKIP duplicate event outputId=${outputId} status=completed (${idempotency.reason})`,
        );
        return { success: true, skipped: true, outputId, outputKey: output.outputKey };
      }

      const claimed = await step.run("mark-processing", async () =>
        Boolean(await markCreativeWorkOutputProcessing(workspaceId, workItemId, outputId))
      );
      if (!claimed) {
        return { success: true, skipped: true, outputId };
      }

      // R-011: route by the generation policy version frozen in the input
      // snapshot at prepare time — never by the live env switch — so
      // in-flight outputs finish under their original contract when the
      // switch is flipped.
      // R-001: v1 works resolve protocol, canonical mode and execution policy
      // through the single pure translation; legacy-frozen works (and the
      // explicit legacy social_post toolKind) keep the current adapter.
      const generationPolicyVersion = resolveGenerationPolicyVersion(work.inputSnapshot);
      isV1Policy = generationPolicyVersion === "quality_recovery_v1";
      imageCallCount = output.imageCallCount ?? 0;
      const protocol = isV1Policy
        ? resolveCreativeWorkProtocol({
            toolKind: work.toolKind,
            format: output.targetFormat as CreativeWorkFormat,
            targetFormats: work.settings?.targetFormats ?? [],
            revision: Boolean(parentOutput),
          })
        : null;
      if (protocol) {
        logger.info(
          `[creativeWorkOutputJob] policy=quality_recovery_v1 outputId=${outputId} mode=${protocol.mode} execution=${protocol.execution}`,
        );
      }

      // R-007: structured telemetry correlation base — every stage/terminal
      // event carries the durable call authority and the requeue counter.
      const telemetryBase = () => ({
        workspaceId,
        workItemId,
        outputId,
        protocol: protocol?.mode ?? "legacy",
        imageCallCount,
        retryCount: output.retryCount,
      });

      // R-007 lease heartbeat: touches updatedAt ONLY while this job still
      // owns the processing row. A null row means the lease was lost — abort
      // before any further provider call or commit.
      const checkLease = async (stage: string): Promise<boolean> => {
        const alive = await step.run(`heartbeat-${stage}`, async () =>
          Boolean(await touchCreativeWorkOutputHeartbeat(workspaceId, workItemId, outputId))
        );
        if (!alive) {
          logCreativeWorkOutputTerminal({
            ...telemetryBase(),
            outcome: "lease_lost",
            refunded: terminalRefunded,
            durationMs: jobTimer.elapsedMs(),
          });
        }
        return alive;
      };

      const targetFormat = output.targetFormat as SocialPostFormat;
      const dimensions = getTargetDimensions(targetFormat) ?? {
        width: 1024,
        height: 1280,
      };

      // Pre-generator block: prompt assembly + reference image load. Any
      // failure here happens before the upstream provider is invoked, so
      // we refund the per-output credit and let the outer catch mark the
      // output failed. Failures AFTER the provider follow R-006: v1 outputs
      // settle net zero via the idempotent terminal refund; legacy-frozen
      // works keep the historical no-refund behavior.
      let prompt: string;
      let referenceImages: Array<{ buffer: Buffer; mimeType: string; name: string }>;
      // R-005: v1 direct outputs carry the QA context assembled here (frozen
      // fact pack + role-bound reference plan) into the analyze-quality step.
      let v1FactPack: CreativeWorkFactPack | null = null;
      let v1RequiredReferenceRoles: CreativeWorkReferenceRole[] = [];
      let v1QaReferences: AnalyzeCreativeWorkQaReference[] = [];
      // R-006: frozen prompt inputs reused verbatim by the objective
      // correction — the second call starts from the SAME prompt/sources and
      // only appends the failure codes (R-004 criterion 5).
      let v1PromptInputs: Omit<BuildCreativeWorkPromptInput, "correction"> | null = null;
      try {
        const inputSnapshot = work.inputSnapshot ?? {
          request: work.request,
          settings: work.settings,
          sources: [],
        };

        const referenceAssets = identitySnapshot.assets
          .filter((asset) => asset.usageMode === "reference")
          .slice(0, MAX_REFERENCE_IMAGES);

        if (output.parentOutputId && (!parentOutput?.outputKey || parentOutput.status !== "completed")) {
          throw new Error("creative_work_revision_parent_missing");
        }
        const revisionAsset = output.revisionAssetId
          ? await getWorkspaceAssetById(output.revisionAssetId, workspaceId)
          : null;
        if (output.revisionAssetId && (!revisionAsset || !revisionAsset.type.startsWith("image/"))) {
          throw new Error("creative_work_revision_asset_missing");
        }
        const revisionReferences = [
          ...(parentOutput?.outputKey ? [{
            assetKey: parentOutput.outputKey,
            mimeType: "image/png",
            label: `Versão ${parentOutput.versionNumber}`,
          }] : []),
          ...(revisionAsset ? [{
            assetKey: revisionAsset.key,
            mimeType: revisionAsset.type,
            label: revisionAsset.name,
          }] : []),
        ];

        // Binary payloads cannot cross an Inngest step boundary. The durable
        // asset keys live in the identity snapshot; buffers stay local to this
        // invocation and are consumed immediately by the provider.
        if (protocol) {
          // R-003 / spec 8: the reference plan is derived from the protocol
          // and reserves mandatory authorities first — the original art for
          // adaptation, content-then-style for restyle. Brand Training
          // identity assets only fill the slots left. A mandatory authority
          // that cannot be honored fails as reference_failure before the
          // provider; adaptation never falls back to reference-less generate.
          const planned = planCreativeWorkReferences({
            mode: protocol.mode,
            sources: work.inputSnapshot?.sources ?? [],
            identityReferenceAssets: referenceAssets.map((asset) => ({
              assetKey: asset.assetKey,
              mimeType: asset.mimeType,
              label: asset.label,
            })),
            revisionReferences,
            limit: MAX_REFERENCE_IMAGES,
          });
          // Buffers load BEFORE the prompt is assembled: the REFERENCES block
          // binds `#n` to the n-th attached image purely positionally, so the
          // plan is filtered down to the slots that actually loaded and only
          // those reach the prompt builder — a skipped optional slot never
          // desyncs the numbering from the provider image array.
          const loadedReferences = (await Promise.all(
            planned.map(async (slot): Promise<{
              slot: CreativeWorkReferenceSlot;
              reference: { buffer: Buffer; mimeType: string; name: string };
            } | null> => {
              try {
                return {
                  slot,
                  reference: {
                    buffer: await objectStorage.get(slot.assetKey),
                    mimeType: slot.mimeType,
                    name: slot.label,
                  },
                };
              } catch (error) {
                if (slot.required) {
                  throw new CreativeWorkReferenceError(
                    `${slot.role} reference "${slot.label}" could not be loaded`,
                    { cause: error },
                  );
                }
                // Optional slots (Brand Training identity, style guidance)
                // are best-effort: a failed download never fails the whole
                // output — the slot is dropped and generation proceeds with
                // every mandatory authority intact.
                logger.warn(
                  `[creativeWorkOutputJob] optional reference skipped outputId=${outputId} role=${slot.role} assetKey=${slot.assetKey}: ${error instanceof Error ? error.message : String(error)}`,
                );
                return null;
              }
            }),
          )).filter((loaded): loaded is {
            slot: CreativeWorkReferenceSlot;
            reference: { buffer: Buffer; mimeType: string; name: string };
          } => loaded !== null);
          // R-007: normalize references to safe dimension/pixel limits BEFORE
          // the provider, preserving alpha. Raw megapixel downloads stay
          // scoped to `loadedReferences` and become collectable once the
          // normalized copies exist. A required slot that cannot be
          // normalized is a reference_failure; an optional one is dropped.
          const normalizedReferences: Array<{
            slot: CreativeWorkReferenceSlot;
            reference: { buffer: Buffer; mimeType: string; name: string };
          }> = [];
          for (const loaded of loadedReferences) {
            try {
              const normalized = await normalizeCreativeWorkReferenceImage({
                buffer: loaded.reference.buffer,
                mimeType: loaded.reference.mimeType,
              });
              normalizedReferences.push({
                slot: loaded.slot,
                reference: {
                  buffer: normalized.buffer,
                  mimeType: normalized.mimeType,
                  name: normalizedCreativeWorkReferenceName(loaded.reference.name, normalized.mimeType),
                },
              });
            } catch (error) {
              if (loaded.slot.required) {
                throw new CreativeWorkReferenceError(
                  `${loaded.slot.role} reference "${loaded.slot.label}" could not be normalized`,
                  { cause: error },
                );
              }
              logger.warn(
                `[creativeWorkOutputJob] optional reference dropped on normalization outputId=${outputId} role=${loaded.slot.role} assetKey=${loaded.slot.assetKey}: ${error instanceof Error ? error.message : String(error)}`,
              );
            }
          }
          const loadedSlots = normalizedReferences.map((loaded) => loaded.slot);
          referenceImages = normalizedReferences.map((loaded) => loaded.reference);
          // R-004: v1 direct outputs use the protocol-aware builder fed by the
          // resolved mode, the frozen fact pack, the persisted level/format
          // and the role-bound reference plan. The explicit legacy
          // `social_post` toolKind (legacy_tournament) keeps the legacy
          // builder and its current adapter behavior until its own migration.
          const factPack = protocol.execution === "direct"
            ? resolveCreativeWorkFactPack(work.inputSnapshot)
            : null;
          if (protocol.execution === "direct" && !factPack) {
            // v1 direct outputs always freeze a fact pack at prepare time
            // (R-002); resolving null here means an upstream bug or a
            // corrupted snapshot. Keep the defensive legacy read — never
            // fail — but make the anomaly visible.
            logger.warn(
              `[creativeWorkOutputJob] v1 direct output without frozen fact pack outputId=${outputId} workItemId=${workItemId} — falling back to the snapshot request as sole factual authority`,
            );
          }
          if (protocol.execution === "direct") {
            // R-005: freeze the QA context for the analyze-quality step —
            // the same fact pack and the slots that actually loaded feed the
            // objective evaluator so `#n` stays aligned with the provider call.
            v1FactPack = factPack;
            v1RequiredReferenceRoles = planned
              .filter((slot) => slot.required)
              .map((slot) => slot.role);
            v1QaReferences = normalizedReferences.map((loaded) => ({
              role: loaded.slot.role,
              label: loaded.slot.label,
              required: loaded.slot.required,
              buffer: loaded.reference.buffer,
              mimeType: loaded.reference.mimeType,
            }));
          }
          prompt = protocol.execution === "direct"
            ? buildCreativeWorkPrompt({
                mode: protocol.mode,
                format: targetFormat,
                copy,
                inputSnapshot,
                factPack,
                identitySnapshot,
                creativeLevel,
                references: loadedSlots,
                revisionInstruction: output.revisionInstruction,
              })
            : buildSocialPostPrompt({
                format: targetFormat,
                brief,
                copy,
                identitySnapshot,
                inputSnapshot,
                revisionInstruction: output.revisionInstruction,
                creativeLevel,
              });
          if (protocol.execution === "direct") {
            v1PromptInputs = {
              mode: protocol.mode,
              format: targetFormat,
              copy,
              inputSnapshot,
              factPack,
              identitySnapshot,
              creativeLevel,
              references: loadedSlots,
              revisionInstruction: output.revisionInstruction,
            };
          }
        } else {
          // Legacy-frozen works keep the legacy builder and reference loading
          // byte-identical (R-004 criterion 6).
          prompt = buildSocialPostPrompt({
            format: targetFormat,
            brief,
            copy,
            identitySnapshot,
            inputSnapshot,
            revisionInstruction: output.revisionInstruction,
            creativeLevel,
          });
          const sourceReferences = (work.inputSnapshot?.sources ?? [])
            .filter((source) => (
              work.toolKind === "restyle" || source.usage === "style" || source.usage === "both"
            ) && source.assetKey && source.mimeType)
            // Same label policy as the v1 plan: frozen display name when the
            // snapshot carries one, otherwise a role label — never the raw id.
            .map((source) => ({ assetKey: source.assetKey!, mimeType: source.mimeType!, label: source.label?.trim() || "Source image" }));

          const orderedReferences = work.toolKind === "restyle"
            ? [...revisionReferences, ...sourceReferences, ...referenceAssets]
            : [...revisionReferences, ...referenceAssets, ...sourceReferences];
          referenceImages = await Promise.all(
            orderedReferences.slice(0, MAX_REFERENCE_IMAGES).map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              mimeType: asset.mimeType,
              name: asset.label,
            })),
          );
        }
      } catch (error) {
        await refundPreGeneratorOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: error instanceof Error ? error.message : String(error),
          failurePhase: "pre_provider",
        });
        throw error;
      }

      const generationRequest: GenerationRequest = {
        authorship: {
          workspaceId,
          userId: work.createdByUserId ?? null,
        },
        origin: "quick_tool",
        surface: "quick_tool",
        intent: {
          mode: protocol?.mode ?? (parentOutput ? "creative_revision" : "social_post"),
          objective: brief.objective ?? null,
        },
        identity: {
          clientProfileId: work.clientProfileId,
          referenceImages,
          brandConstraints: null,
        },
        format: {
          targetFormat,
          dimensions,
          constraints: null,
        },
        source: {
          parentId: parentOutput?.id ?? null,
          sourceVersionId: parentOutput?.id ?? null,
          lineageId: parentOutput ? `${workItemId}:${output.creativeLevel}:${output.targetFormat}` : null,
          packageSource: parentOutput ? "creative_work_output" : "creative_work_brief",
        },
        prompt: { text: prompt },
        cost: {
          chargeAmount: GENERATION_CREDIT_COSTS.creativeWorkOutput,
          refundPolicy: "default",
        },
        idempotency: {
          billingKey: parentOutput
            ? `creative-work:${workItemId}:revision:${outputId}`
            : creativeWorkUnitBillingKey(workItemId, outputId),
          skipWhenOutputExists: true,
        },
        destination: {
          kind: "creative_work_output",
          id: outputId,
          storagePrefix: `creative-work/${outputId}`,
          workItemId,
        },
        executionPolicy: protocol?.execution,
        attempt: output.retryCount,
      };

      // R-007: lease re-check between steps — abort BEFORE the provider call
      // when this job no longer owns the processing row.
      if (!(await checkLease("pre-generate"))) {
        return { success: false, skipped: true, leaseLost: true, outputId };
      }

      providerInvoked = Boolean(protocol);
      const generated = await step.run("generate-base", async () => {
        if (protocol) {
          // R-006: the provider call is claimed atomically BEFORE reaching
          // the provider — once image_call_count hits the absolute ceiling
          // (2) the claim fails here and no provider call happens.
          const claimedCall = await claimCreativeWorkOutputImageCall(
            workspaceId,
            workItemId,
            outputId,
          );
          if (!claimedCall) return { outputKey: null as string | null };
          imageCallCount = claimedCall.imageCallCount;
          logCreativeWorkOutputStage({
            ...telemetryBase(),
            stage: "claim_image_call",
            status: "completed",
            detail: `imageCallCount=${imageCallCount}`,
          });
        }
        // Same canonical executor as campaign/assistant (Gate 3 / item 25).
        const result = await executeCanonicalGeneration(generationRequest);
        return { outputKey: result.outputKey as string | null };
      });
      const generatedOutputKey = (generated as unknown as { outputKey: string | null }).outputKey;
      if (!generatedOutputKey) {
        // Durable budget already consumed before this run (e.g. a stalled
        // run raced a manual retry): terminal failure with ZERO provider
        // calls here, settled net zero by the idempotent terminal refund.
        terminalRefunded = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: "image_call_budget_exhausted",
        });
        await step.run("mark-failed", async () => {
          await failCreativeWorkOutput(workspaceId, workItemId, outputId, "image_call_budget_exhausted");
        });
        logCreativeWorkOutputTerminal({
          ...telemetryBase(),
          outcome: "failed",
          failureCode: "image_call_budget_exhausted",
          refunded: terminalRefunded,
          durationMs: jobTimer.elapsedMs(),
        });
        return { success: false, outputId, failureCode: "image_call_budget_exhausted" };
      }
      // The correction flow may replace the persisted key with its own.
      let finalOutputKey = generatedOutputKey;

      const exactAssets = identitySnapshot.assets.filter(
        (asset) => asset.usageMode === "exact" && asset.placement,
      );

      if (exactAssets.length > 0) {
        await step.run("compose-exact-layers", async () => {
          const [baseBuffer, layers] = await Promise.all([
            objectStorage.get(generatedOutputKey),
            Promise.all(exactAssets.map(async (asset) => ({
              buffer: await objectStorage.get(asset.assetKey),
              gravity: asset.placement!.gravity as BrandAssetGravity,
              widthRatio: asset.placement!.widthRatio,
            }))),
          ]);
          const composed = await composeExactBrandAssets(
            baseBuffer,
            layers,
            dimensions,
          );
          await objectStorage.put(generatedOutputKey, composed, "image/png");
        });
      }

      // Keep the image buffer out of step results; only its storage key is
      // durable/serializable across Inngest boundaries.
      const finalBuffer = await objectStorage.get(generatedOutputKey);

      const clientProfile = (await step.run("load-client-profile", async () => {
        return getClientProfile(workspaceId, work.clientProfileId);
      })) as unknown as { id: string; name: string } | null;

      // R-005/R-006: v1 direct outputs run the tri-state objective QA —
      // deterministic file/dimension/reference checks plus a visual
      // evaluation contextualized by the frozen fact pack and the role-bound
      // references. The SAME assessment covers the base image and the
      // exclusive objective correction; only the buffer and the claimed
      // attempt (imageCallCount, the durable call authority) differ. The
      // subjective score is advisory only: it never rejects and never
      // triggers a retry. `inconclusive` completes with a review signal.
      const runV1Assessment = (imageBuffer: Buffer, attempt: number) =>
        runCreativeWorkQualityAssessment({
          workItemId,
          outputId,
          attempt,
          imageBuffer,
          expectedDimensions: dimensions,
          requiredReferenceRoles: v1RequiredReferenceRoles,
          attachedReferenceRoles: v1QaReferences
            .filter((reference) => reference.required)
            .map((reference) => reference.role),
          qa: {
            mode: protocol!.mode,
            format: targetFormat,
            request: work.inputSnapshot?.request ?? work.request,
            copy,
            factPack: v1FactPack,
            brandName: v1FactPack?.identity.brandName ?? clientProfile?.name ?? null,
            references: v1QaReferences,
            locale: "pt-BR",
          },
          score: {
            imageBuffer,
            mimeType: "image/png",
            campaign: {
              name: brief.theme,
              client: clientProfile?.name ?? "",
              product: brief.theme,
              offer: brief.offer,
              objective: brief.objective,
              audience: brief.audience,
            },
            derivation: {
              ctaText: copy.cta,
              format: targetFormat,
              generationMode: protocol!.mode,
              feedback: null,
              creativeLevel,
              creativeDiagnosis: null,
            },
            locale: "pt-BR",
            contract: null,
          },
        });

      const analyzed = (await step.run("analyze-quality", async () => {
        // Legacy-frozen works keep the historical score-threshold
        // post-generation byte-identical; v1 direct outputs run the tri-state
        // objective QA (R-005).
        if (protocol?.execution === "direct") {
          const assessment = await runV1Assessment(
            finalBuffer,
            Math.max(imageCallCount, 1),
          );
          logger.info(
            `[creativeWorkOutputJob] objective QA outputId=${outputId} verdict=${assessment.objectiveVerdict} codes=${assessment.quality.objectiveCodes.join(",") || "none"} attempt=${assessment.quality.attempt}`,
          );
          logCreativeWorkOutputStage({
            ...telemetryBase(),
            stage: "analyze_quality",
            status: "completed",
            verdict: assessment.objectiveVerdict,
          });
          return { kind: "assessment" as const, assessment };
        }
        const postGen = await runCreativeWorkPostGeneration({
          workItemId,
          outputId,
          analyze: {
            imageBuffer: finalBuffer,
            mimeType: "image/png",
            // R5 mapping: brief fields → AnalyzeInput.campaign
            campaign: {
              name: brief.theme,
              client: clientProfile?.name ?? "",
              product: brief.theme,
              offer: brief.offer,
              objective: brief.objective,
              audience: brief.audience,
            },
            // R5 mapping: copy + format → AnalyzeInput.derivation
            derivation: {
              ctaText: copy.cta,
              format: targetFormat,
              generationMode: "art_variation",
              feedback: null,
              creativeLevel,
              creativeDiagnosis: null,
            },
            locale: "pt-BR",
            contract: null,
          },
        });
        return { kind: "postgen" as const, postGen };
      })) as unknown as
        | { kind: "assessment"; assessment: CreativeWorkQualityAssessmentResult }
        | { kind: "postgen"; postGen: CreativeWorkPostGenerationResult };

      if (analyzed.kind === "postgen" && analyzed.postGen.decision === "reject_low_quality") {
        // Adapter applies shared post-gen refund decision — does not re-decide policy.
        await applyRefundDecision({
          workspaceId,
          workItemId,
          outputId,
          reason: analyzed.postGen.reason,
          decision: analyzed.postGen.refund,
          description: "creative_work_output_low_quality_refund",
        });
        await failCreativeWorkOutput(workspaceId, workItemId, outputId, "low_quality");
        logger.warn(
          `[creativeWorkOutputJob] low-quality outputId=${outputId} reason=${analyzed.postGen.reason}`,
        );
        return {
          success: false,
          outputId,
          failureCode: "low_quality",
        };
      }

      let completedQuality = analyzed.kind === "assessment"
        ? (analyzed.assessment.quality as unknown as Record<string, unknown>)
        : ((analyzed.postGen.quality as unknown as Record<string, unknown> | null) ?? null);
      let completedVerdict: string | null =
        analyzed.kind === "assessment" ? analyzed.assessment.objectiveVerdict : null;

      // R-006: the second (and final) provider call is EXCLUSIVE — transport
      // retry XOR objective correction, never both, never a third. A
      // confirmed objective fail with budget left claims the correction here;
      // the correction re-uses the same frozen prompt/sources and appends
      // only the failure codes and their surgical instructions. The CAS
      // ceiling enforces the XOR: if a transport retry already consumed call
      // 2, the claim fails and the output settles terminally. `inconclusive`
      // and subjective-only findings never reach this branch.
      if (
        analyzed.kind === "assessment" &&
        analyzed.assessment.objectiveVerdict === "fail" &&
        v1PromptInputs
      ) {
        if (!(await checkLease("pre-correction"))) {
          return { success: false, skipped: true, leaseLost: true, outputId };
        }

        const correction = await step.run("generate-correction", async () => {
          const claimedCall = await claimCreativeWorkOutputImageCall(
            workspaceId,
            workItemId,
            outputId,
          );
          if (!claimedCall) return { outputKey: null as string | null };
          imageCallCount = claimedCall.imageCallCount;
          logCreativeWorkOutputStage({
            ...telemetryBase(),
            stage: "claim_correction_call",
            status: "completed",
            detail: `imageCallCount=${imageCallCount}`,
          });
          const confirmedNotes = analyzed.assessment.quality.findings
            .filter((finding) => finding.status === "confirmed")
            .map((finding) => finding.note);
          const correctionPrompt = buildCreativeWorkPrompt({
            ...v1PromptInputs!,
            correction: {
              codes: analyzed.assessment.quality.objectiveCodes,
              instructions:
                confirmedNotes.join(" ") ||
                "Fix ONLY the confirmed objective failures listed above.",
            },
          });
          const result = await executeCanonicalGeneration({
            ...generationRequest,
            prompt: { text: correctionPrompt },
            attempt: 1,
          });
          return { outputKey: result.outputKey as string | null };
        });
        const correctionOutputKey = (correction as unknown as { outputKey: string | null }).outputKey;

        if (!correctionOutputKey) {
          terminalRefunded = await refundTerminalOutput({
            workspaceId,
            workItemId,
            outputId,
            reason: "image_call_budget_exhausted",
          });
          await step.run("mark-failed", async () => {
            await failCreativeWorkOutput(workspaceId, workItemId, outputId, "image_call_budget_exhausted");
          });
          logCreativeWorkOutputTerminal({
            ...telemetryBase(),
            outcome: "failed",
            failureCode: "image_call_budget_exhausted",
            verdict: "fail",
            refunded: terminalRefunded,
            durationMs: jobTimer.elapsedMs(),
          });
          return { success: false, outputId, failureCode: "image_call_budget_exhausted" };
        }

        if (exactAssets.length > 0) {
          await step.run("compose-exact-layers-correction", async () => {
            const [baseBuffer, layers] = await Promise.all([
              objectStorage.get(correctionOutputKey),
              Promise.all(exactAssets.map(async (asset) => ({
                buffer: await objectStorage.get(asset.assetKey),
                gravity: asset.placement!.gravity as BrandAssetGravity,
                widthRatio: asset.placement!.widthRatio,
              }))),
            ]);
            const composed = await composeExactBrandAssets(
              baseBuffer,
              layers,
              dimensions,
            );
            await objectStorage.put(correctionOutputKey, composed, "image/png");
          });
        }

        const correctedBuffer = await objectStorage.get(correctionOutputKey);
        const correctionAssessment = (await step.run("analyze-correction", async () =>
          runV1Assessment(correctedBuffer, Math.max(imageCallCount, 1))
        )) as unknown as CreativeWorkQualityAssessmentResult;
        logCreativeWorkOutputStage({
          ...telemetryBase(),
          stage: "analyze_correction",
          status: "completed",
          verdict: correctionAssessment.objectiveVerdict,
        });

        if (correctionAssessment.objectiveVerdict === "fail") {
          // The correction confirmed the objective failure — terminal. No
          // third call exists; the output settles net zero via the
          // idempotent terminal refund.
          terminalRefunded = await refundTerminalOutput({
            workspaceId,
            workItemId,
            outputId,
            reason: "creative_work_objective_correction_failed",
          });
          await step.run("mark-failed", async () => {
            await failCreativeWorkOutput(workspaceId, workItemId, outputId, "factual_violation");
          });
          logCreativeWorkOutputTerminal({
            ...telemetryBase(),
            outcome: "failed",
            failureCode: "factual_violation",
            verdict: "fail",
            refunded: terminalRefunded,
            durationMs: jobTimer.elapsedMs(),
          });
          return { success: false, outputId, failureCode: "factual_violation" };
        }

        finalOutputKey = correctionOutputKey;
        completedQuality = correctionAssessment.quality as unknown as Record<string, unknown>;
        completedVerdict = correctionAssessment.objectiveVerdict;
      }

      // R-007: lease re-check before the commit — a job that lost the row
      // must not complete it.
      if (!(await checkLease("pre-complete"))) {
        return { success: false, skipped: true, leaseLost: true, outputId };
      }

      const completed = await step.run("mark-completed", async () =>
        Boolean(await completeCreativeWorkOutput(workspaceId, workItemId, outputId, {
          outputKey: finalOutputKey,
          cost: OUTPUT_COST,
          quality: completedQuality,
        }))
      );
      if (!completed) {
        // Late completion: the row left `processing` before the commit landed
        // (lease stolen, stale sweep, duplicate delivery). Discard — status
        // and ledger stay untouched (R-006/R-007).
        logCreativeWorkLateCompletionDiscarded({
          ...telemetryBase(),
          outputKey: finalOutputKey,
        });
        logCreativeWorkOutputTerminal({
          ...telemetryBase(),
          outcome: "late_completion_discarded",
          verdict: completedVerdict,
          refunded: terminalRefunded,
          durationMs: jobTimer.elapsedMs(),
        });
        return { success: true, skipped: true, outputId };
      }

      // Phase 5 / item 37: library on complete (not only on select).
      // Isolated from generation success: a library/storage failure must never
      // reclassify a completed output as failed (retries: 0).
      try {
        await step.run("ensure-library", async () => {
          await ensureCreativeWorkOutputInLibrary({
            workspaceId,
            outputKey: finalOutputKey,
            theme: brief.theme,
            creativeLevel,
          });
        });
      } catch (libraryError) {
        const detail =
          libraryError instanceof Error ? libraryError.message : String(libraryError);
        logger.warn(
          `[creativeWorkOutputJob] ensure-library failed outputId=${outputId} (output stays completed): ${detail}`,
        );
      }

      // R-007.7: telemetry is auxiliary — a failure here must NOT fall into
      // the outer catch as a fake post-provider failure: the output is
      // already COMPLETED and the catch would apply a terminal refund to it
      // (the completion CAS protects the status, not the ledger).
      try {
        logCreativeWorkOutputTerminal({
          ...telemetryBase(),
          outcome: "completed",
          verdict: completedVerdict,
          refunded: terminalRefunded,
          durationMs: jobTimer.elapsedMs(),
        });
      } catch (telemetryError) {
        logger.warn(
          `[creativeWorkOutputJob] terminal telemetry failed outputId=${outputId} (output stays completed): ${telemetryError instanceof Error ? telemetryError.message : String(telemetryError)}`,
        );
      }
      logger.info(
        `[creativeWorkOutputJob] DONE outputId=${outputId} outputKey=${finalOutputKey}`,
      );
      return { success: true, outputId, outputKey: finalOutputKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // R-003: reference-plan failures keep their typed code so the UI can
      // distinguish a reference failure from an unknown provider failure.
      const code = error instanceof CreativeWorkReferenceError
        ? error.code
        : sanitizeCreativeWorkFailureCode(message);
      logger.error(
        `[creativeWorkOutputJob] FAIL outputId=${outputId} code=${code} message=${message}`,
      );
      // R-006: the transport retry consumes the second call ONLY when the
      // durable budget still has one — a correction that timed out
      // (imageCallCount = 2) never earns a third call. Legacy outputs never
      // claim, so their historical requeue behavior is unchanged.
      if (
        isRetryableProviderError(error) &&
        imageCallCount < CREATIVE_WORK_MAX_IMAGE_CALLS
      ) {
        try {
          const retried = await requeueCreativeWorkOutputOnce(workspaceId, workItemId, outputId);
          if (retried) {
            try {
              await inngest.send({ name: "creative-work.generate", data: { workspaceId, workItemId, outputId } });
              return { success: false, retrying: true, outputId, failureCode: code };
            } catch (dispatchError) {
              await failQueuedCreativeWorkOutput(workspaceId, workItemId, outputId, "auto_retry_dispatch_failed");
              logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, dispatchError);
              // R-006: the retry never left the gate but the image call was
              // already consumed — for v1 this is a terminal post-provider
              // failure and settles net zero (idempotent key). Legacy keeps
              // its historical no-refund behavior.
              if (isV1Policy && providerInvoked) {
                terminalRefunded = await refundTerminalOutput({
                  workspaceId,
                  workItemId,
                  outputId,
                  reason: "auto_retry_dispatch_failed",
                });
              }
              return { success: false, outputId, failureCode: "auto_retry_dispatch_failed" };
            }
          }
        } catch (retryError) {
          logger.error(`[creativeWorkOutputJob] auto-retry dispatch failed outputId=${outputId}`, retryError);
        }
      }
      // R-006: a v1 output that fails TERMINALLY after the provider was
      // invoked settles net zero via the idempotent terminal refund (keyed
      // per output — a repeated delivery of this failure is a duplicate,
      // never a second credit). Pre-provider failures were already refunded
      // above; legacy-frozen works keep the historical no-refund behavior.
      if (isV1Policy && providerInvoked) {
        terminalRefunded = await refundTerminalOutput({
          workspaceId,
          workItemId,
          outputId,
          reason: message,
        });
      }
      try {
        await step.run("mark-failed", async () => {
          await failCreativeWorkOutput(workspaceId, workItemId, outputId, code);
        });
      } catch (markError) {
        const detail =
          markError instanceof Error ? markError.message : "Unknown error";
        logger.error(
          `[creativeWorkOutputJob] mark-failed error outputId=${outputId}: ${detail}`,
        );
      }
      logCreativeWorkOutputTerminal({
        workspaceId,
        workItemId,
        outputId,
        protocol: isV1Policy ? "v1" : "legacy",
        imageCallCount,
        outcome: "failed",
        failureCode: code,
        refunded: terminalRefunded,
        durationMs: jobTimer.elapsedMs(),
      });
      return { success: false, outputId, failureCode: code };
    } finally {
      try {
        await step.run("refresh-aggregate-status", async () => {
          await refreshCreativeWorkStatus(workspaceId, workItemId);
        });
      } catch (statusError) {
        const detail =
          statusError instanceof Error
            ? statusError.message
            : "Unknown error";
        logger.warn(
          `[creativeWorkOutputJob] refresh-status failed outputId=${outputId}: ${detail}`,
        );
      }
    }
  },
);

/**
 * Apply a shared RefundDecision (from policies / post-gen). Adapter-only:
 * does not re-decide policy. `description` labels the ledger row per refund
 * kind so analytics never misattributes a terminal refund as pregen.
 */
async function applyRefundDecision({
  workspaceId,
  workItemId,
  outputId,
  reason,
  decision,
  description,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  decision: RefundDecision;
  description: string;
}): Promise<void> {
  if (!decision.refund) {
    logger.info(
      `[creativeWorkOutputJob] skip refund outputId=${outputId} reason=${decision.reason}`,
    );
    return;
  }
  try {
    const result = await refundCredits({
      workspaceId,
      action: "image_derivation",
      idempotencyKey: decision.idempotencyKey,
      amount: decision.amount,
      metadata: {
        creativeWorkId: workItemId,
        outputId,
        reason,
        policyReason: decision.reason,
        description,
      },
    });
    logger.info(
      `[creativeWorkOutputJob] refundCredits outputId=${outputId} status=${result.status} description=${description} reason=${reason}`,
    );
  } catch (refundError) {
    const detail =
      refundError instanceof Error ? refundError.message : "Unknown error";
    logger.error(
      `[creativeWorkOutputJob] refundCredits FAILED outputId=${outputId} description=${description}: ${detail}`,
    );
  }
}

/**
 * R-006 terminal refund: a v1 output that fails after consuming provider
 * calls settles net zero. Idempotent per output (the decision key is
 * content-stable), so a repeated failure/redelivery credits at most once.
 * Returns whether the policy decided to refund.
 */
async function refundTerminalOutput({
  workspaceId,
  workItemId,
  outputId,
  reason,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
}): Promise<boolean> {
  const decision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase: "terminal",
    workItemId,
    outputId,
  });
  await applyRefundDecision({
    workspaceId,
    workItemId,
    outputId,
    reason,
    decision,
    description: "creative_work_output_terminal_refund",
  });
  return decision.refund;
}

/**
 * Refund the per-output credit when a failure happens BEFORE the upstream
 * generator was invoked — prompt assembly or reference image load. Policy
 * decision comes from decideCreativeWorkRefund; this only applies it.
 */
async function refundPreGeneratorOutput({
  workspaceId,
  workItemId,
  outputId,
  reason,
  failurePhase,
}: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  reason: string;
  failurePhase: "pre_provider" | "low_quality";
}): Promise<void> {
  const decision = decideCreativeWorkRefund({
    surface: "quick_tool",
    failurePhase,
    workItemId,
    outputId,
  });
  await applyRefundDecision({
    workspaceId,
    workItemId,
    outputId,
    reason,
    decision,
    description:
      failurePhase === "low_quality"
        ? "creative_work_output_low_quality_refund"
        : "creative_work_output_pregen_refund",
  });
}
