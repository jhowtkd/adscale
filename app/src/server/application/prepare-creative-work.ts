import { CreativeCopyContextError, generateSocialPostCopy } from "@/server/creative-work/copy";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import {
  detectCreativeWorkBrandConflict,
  type CreativeWorkBrandConflictDetails,
} from "@/server/creative-work/brand-conflict";
import {
  buildCreativeWorkFactPack,
  creativeWorkFactPackBrandFromKit,
  type CreativeWorkBrandAuthority,
} from "@/server/creative-work/fact-pack";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  inferSocialPostBrief,
  buildInferredBriefing,
} from "@/server/creative-work/prepare";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import {
  buildTypographyPlan,
  TypographyPlanError,
} from "@/server/creative-work/typography-plan";
import {
  creativeWorkPreparationSchema,
  generationPolicyVersionFromSwitch,
  quoteCreativeWork,
  resolveGenerationPolicyVersion,
  resolveCreativeWorkInferredBriefing,
  socialPostBriefSchema,
  socialPostCopySchema,
  type CreativeSourceStatus,
  type CreativeSourceUsage,
  type CreativeWorkInputSnapshot,
} from "@/server/creative-work/contracts";
import type { ContentBrief } from "@/server/ai/image-analysis";
import { getBrandKit } from "@/server/repositories/brand-kit";
import {
  getCreativeWork,
  getCreativeWorkSourceAssetDetails,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { env } from "@/server/validation/env";

const RESTYLE_STYLE_ASSET_SOURCES = new Set(["creative_work", "curated_inspiration_copy"]);

/**
 * Effective content/style roles for the ready sources. Restyle infers roles
 * (template/curated assets are style; the first remaining source is content);
 * every other protocol keeps the confirmed usage. Shared by prepare and by
 * the draft brand-conflict detection below so both see the same sources.
 */
function resolveEffectiveSources<TSource extends { id: string; templateId: string | null; usage: CreativeSourceUsage }>(
  toolKind: string,
  readySources: readonly TSource[],
  sourceAssets: ReadonlyMap<string, { source: string }>,
): Array<{ source: TSource; usage: CreativeSourceUsage }> {
  let hasRestyleContent = false;
  return readySources.map((source) => {
    if (toolKind !== "restyle") return { source, usage: source.usage };
    const isKnownStyle = Boolean(source.templateId)
      || RESTYLE_STYLE_ASSET_SOURCES.has(sourceAssets.get(source.id)?.source ?? "");
    const usage = isKnownStyle || hasRestyleContent ? "style" as const : "content" as const;
    if (usage === "content") hasRestyleContent = true;
    return { source, usage };
  });
}

/**
 * The current draft's restyle brand conflict, if any (R-003). Shared by
 * prepare — which blocks on it — and the resolveBrandConflict route, which
 * only accepts a choice while the exact conflict it answers is detectable.
 */
export async function detectCreativeWorkDraftBrandConflict(input: {
  workspaceId: string;
  work: { toolKind: string; clientProfileId: string | null };
  sources: ReadonlyArray<{
    id: string;
    assetId: string | null;
    templateId: string | null;
    status: CreativeSourceStatus;
    usage: CreativeSourceUsage;
    contentAnalysis: ContentBrief | null;
  }>;
}): Promise<CreativeWorkBrandConflictDetails | null> {
  if (input.work.toolKind !== "restyle") return null;
  const readySources = input.sources.filter((source) => source.status === "ready");
  const [sourceAssets, brandKit] = await Promise.all([
    getCreativeWorkSourceAssetDetails(input.workspaceId, readySources),
    getBrandKit(input.workspaceId, input.work.clientProfileId),
  ]);
  return detectCreativeWorkBrandConflict({
    sources: resolveEffectiveSources(input.work.toolKind, readySources, sourceAssets)
      .map(({ source, usage }) => ({
        sourceId: source.id,
        usage,
        content: source.contentAnalysis,
      })),
    activeBrandName: brandKit?.name ?? null,
  });
}

/** Compare snapshots ignoring the policy version, which is checked separately. */
function withoutPolicyVersion(snapshot: CreativeWorkInputSnapshot | null) {
  const rest = { ...snapshot };
  delete rest.generationPolicyVersion;
  return rest;
}

export async function prepareCreativeWork(input: { workspaceId: string; workItemId: string }) {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, executor);
    if (!aggregate) return { ok: false as const, error: { code: "work_not_found" as const } };
    if (aggregate.work.status !== "draft") {
      return { ok: false as const, error: { code: "work_not_draft" as const } };
    }
    if (aggregate.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) {
      return { ok: false as const, error: { code: "sources_not_ready" as const } };
    }
    if (aggregate.work.toolKind === "single" && aggregate.sources.some((source) => !source.usageConfirmed)) {
      return { ok: false as const, error: { code: "source_usage_required" as const } };
    }
    const readySources = aggregate.sources.filter((source) => source.status === "ready");
    if (!aggregate.work.request.trim() && readySources.length === 0) {
      return { ok: false as const, error: { code: "missing_input" as const } };
    }
    const preparation = creativeWorkPreparationSchema.safeParse({
      intent: aggregate.work.toolKind,
      format: aggregate.work.format,
      settings: aggregate.work.settings,
    });
    if (!preparation.success) {
      return { ok: false as const, error: { code: "invalid_preparation" as const } };
    }
    const sourceAssets = await getCreativeWorkSourceAssetDetails(input.workspaceId, readySources, executor);
    const effectiveSources = resolveEffectiveSources(aggregate.work.toolKind, readySources, sourceAssets);
    if (aggregate.work.toolKind === "restyle" && (
      effectiveSources.length < 2
      || !effectiveSources.some(({ usage }) => usage === "content")
      || !effectiveSources.some(({ usage }) => usage === "style")
    )) {
      return { ok: false as const, error: { code: "missing_input" as const } };
    }
    const brandKit = await getBrandKit(input.workspaceId, aggregate.work.clientProfileId, executor);
    // R-003 / spec 8.4: the restyle brand conflict is the only new visible
    // decision. A high-confidence explicit brand in the content art that
    // differs from the active brand blocks preparation — before copy,
    // persistence, billing or any image call — until the user chooses
    // "source" or "active" (persisted in settings, bound to the detected
    // brand it answered). No conflict, ambiguity, or a saved choice bound to
    // THIS detected brand: the flow proceeds without asking again.
    let brandAuthority: CreativeWorkBrandAuthority = { kind: "active" };
    if (preparation.data.intent === "restyle") {
      const conflict = detectCreativeWorkBrandConflict({
        sources: effectiveSources.map(({ source, usage }) => ({
          sourceId: source.id,
          usage,
          content: source.contentAnalysis,
        })),
        activeBrandName: brandKit?.name ?? null,
      });
      if (conflict) {
        const choice = preparation.data.settings.brandConflictChoice;
        // The saved choice only auto-resolves the conflict it answered: a
        // choice bound to another detected brand — or persisted before the
        // binding existed — asks again instead of silently applying.
        const choiceAnswersConflict = preparation.data.settings.brandConflictDetectedBrand === conflict.detectedBrand;
        if (!choice || !choiceAnswersConflict) {
          return { ok: false as const, error: { code: "brand_conflict" as const, details: conflict } };
        }
        if (choice === "source") {
          brandAuthority = { kind: "source", brandName: conflict.detectedBrand };
        }
      }
    }
    const contentAnalyses = effectiveSources.flatMap(({ source, usage }) =>
      usage !== "style" && source.contentAnalysis ? [source.contentAnalysis] : []
    );
    const effectiveFormat = preparation.data.settings.formatMode === "auto"
      ? inferCreativeWorkFormat(contentAnalyses, aggregate.work.request) ?? preparation.data.format
      : preparation.data.format;
    let typographyPlan;
    try {
      typographyPlan = preparation.data.intent === "single"
        ? buildTypographyPlan({
            format: effectiveFormat,
            requestedLayout: preparation.data.settings.textLayout,
            selectedFontAssetKey: preparation.data.settings.fontAssetKey,
            fonts: brandKit?.brandFontAssets ?? [],
          })
        : null;
    } catch (error) {
      if (error instanceof TypographyPlanError) {
        return { ok: false as const, error: { code: "invalid_preparation" as const } };
      }
      throw error;
    }
    // R-001: the canonical mode comes from the single pure translation; the
    // fact pack reuses it instead of re-inferring protocol obligations.
    const protocol = resolveCreativeWorkProtocol({
      toolKind: preparation.data.intent,
      format: effectiveFormat,
      targetFormats: preparation.data.settings.targetFormats,
    });
    // R-002: the fact pack freezes the full request, every effective
    // content|both source fact with provenance, brand constraints and the
    // resolved identity. Style-only sources never contribute factual truth.
    const factPack = buildCreativeWorkFactPack({
      request: aggregate.work.request,
      mode: protocol.mode,
      sources: effectiveSources.map(({ source, usage }) => ({
        sourceId: source.id,
        usage,
        content: source.contentAnalysis,
      })),
      brand: creativeWorkFactPackBrandFromKit(brandKit),
      clientProfileId: aggregate.work.clientProfileId,
      // R-003: a resolved "source" choice makes the art's explicit brand the
      // required identity; otherwise the active brand is registered (and no
      // question ever appears without a confident conflict).
      brandAuthority,
    });
    const parsedBrief = socialPostBriefSchema.safeParse(inferSocialPostBrief(
      aggregate.work.request,
      contentAnalyses,
    ));
    if (!parsedBrief.success) {
      return { ok: false as const, error: { code: "invalid_preparation" as const } };
    }
    const briefing = preparation.data.intent === "single"
      ? buildInferredBriefing({
          request: aggregate.work.request,
          brief: parsedBrief.data,
          factPack,
          toneOfVoice: brandAuthority.kind === "source" ? null : brandKit?.toneOfVoice ?? null,
        })
      : null;
    // R-011: the env switch is a creation-time policy. Its current value is
    // frozen into the snapshot here; jobs later obey this frozen version and
    // never re-read the env, so rollback only affects newly prepared work.
    const snapshot: CreativeWorkInputSnapshot = {
      generationPolicyVersion: generationPolicyVersionFromSwitch(env.CREATIVE_WORK_QUALITY_RECOVERY_ENABLED),
      factPack,
      ...(briefing ? { inferredBriefing: briefing } : {}),
      ...(typographyPlan ? { typographyPlan } : {}),
      request: aggregate.work.request,
      settings: preparation.data.settings,
      sources: effectiveSources.map(({ source, usage }) => ({
        sourceId: source.id,
        updatedAt: source.updatedAt.toISOString(),
        assetKey: sourceAssets.get(source.id)?.assetKey ?? null,
        mimeType: sourceAssets.get(source.id)?.mimeType ?? null,
        // Frozen display name for provider-facing reference labels (R-003):
        // asset-backed sources carry the file name; template/text sources
        // stay null and fall back to a role label in the reference plan.
        label: sourceAssets.get(source.id)?.name ?? null,
        usage,
        content: source.contentAnalysis,
        style: source.styleAnalysis,
      })),
    };
    const quote = quoteCreativeWork({
      intent: preparation.data.intent,
      format: effectiveFormat,
      targetFormats: preparation.data.settings.targetFormats,
      directionPool: preparation.data.settings.directionPool,
    });
    if (
      resolveGenerationPolicyVersion(aggregate.work.inputSnapshot) === resolveGenerationPolicyVersion(snapshot) &&
      // Canonical comparison: a jsonb round trip may reorder keys, so plain
      // JSON.stringify would make this reuse branch unreachable.
      canonicalJsonStringify(withoutPolicyVersion(aggregate.work.inputSnapshot)) === canonicalJsonStringify(withoutPolicyVersion(snapshot)) &&
      aggregate.work.format === effectiveFormat &&
      socialPostBriefSchema.safeParse(aggregate.work.brief).success &&
      socialPostCopySchema.safeParse(aggregate.work.copy).success
    ) {
      if (briefing) {
        const persistedBriefing = resolveCreativeWorkInferredBriefing(aggregate.work.inputSnapshot) ?? briefing;
        return {
          ok: true as const,
          value: {
            briefing: persistedBriefing,
            briefingFactPack: factPack,
            readiness: persistedBriefing.readiness,
            confidence: persistedBriefing.confidence,
            work: aggregate.work,
            quote,
          },
        };
      }
      return { ok: true as const, value: { work: aggregate.work, quote } };
    }
    // R-002: the copy is generated from the fact pack (full request + sourced
    // facts + brand) and validated for provenance. A copy that keeps claims
    // without origin after one textual rewrite fails the preparation as
    // invalid_context — before any billing or image call.
    let copy;
    try {
      // R-003: under a resolved "source" authority the copy speaks for the
      // art's brand; the active kit's voice and element lists belong to the
      // other brand and must not leak into the preserved-source piece.
      copy = await generateSocialPostCopy({
        brief: parsedBrief.data,
        factPack,
        brandName: brandAuthority.kind === "source" ? brandAuthority.brandName : brandKit?.name ?? "Marca",
        toneOfVoice: brandAuthority.kind === "source" ? null : brandKit?.toneOfVoice ?? null,
        requiredElements: brandAuthority.kind === "source" ? null : brandKit?.requiredElements ?? null,
        prohibitedElements: brandAuthority.kind === "source" ? null : brandKit?.prohibitedElements ?? null,
      });
    } catch (error) {
      if (error instanceof CreativeCopyContextError) {
        return {
          ok: false as const,
          error: { code: "invalid_context" as const, details: { violations: error.violations } },
        };
      }
      throw error;
    }
    const work = await updateCreativeWorkDraftIfUnchanged(
      input.workspaceId,
      input.workItemId,
      aggregate.work.updatedAt,
      {
        brief: parsedBrief.data,
        copy,
        title: deriveCreativeWorkTitle(parsedBrief.data.theme),
        format: effectiveFormat,
        settings: preparation.data.settings,
        inputSnapshot: snapshot,
      },
      executor,
    );
    if (!work) return { ok: false as const, error: { code: "stale_input" as const } };
    return briefing
      ? {
          ok: true as const,
          value: {
            briefing,
            briefingFactPack: factPack,
            readiness: briefing.readiness,
            confidence: briefing.confidence,
            work,
            quote,
          },
        }
      : { ok: true as const, value: { work, quote } };
  });
}
