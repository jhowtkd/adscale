import { generateSocialPostCopy } from "@/server/creative-work/copy";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  inferSocialPostBrief,
} from "@/server/creative-work/prepare";
import {
  creativeWorkPreparationSchema,
  quoteCreativeWork,
  socialPostBriefSchema,
  socialPostCopySchema,
} from "@/server/creative-work/contracts";
import { getBrandKit } from "@/server/repositories/brand-kit";
import {
  getCreativeWork,
  getCreativeWorkSourceAssetDetails,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";

const RESTYLE_STYLE_ASSET_SOURCES = new Set(["creative_work", "curated_inspiration_copy"]);

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
    let hasRestyleContent = false;
    const effectiveSources = readySources.map((source) => {
      if (aggregate.work.toolKind !== "restyle") return { source, usage: source.usage };
      const isKnownStyle = Boolean(source.templateId)
        || RESTYLE_STYLE_ASSET_SOURCES.has(sourceAssets.get(source.id)?.source ?? "");
      const usage = isKnownStyle || hasRestyleContent ? "style" as const : "content" as const;
      if (usage === "content") hasRestyleContent = true;
      return { source, usage };
    });
    if (aggregate.work.toolKind === "restyle" && (
      effectiveSources.length < 2
      || !effectiveSources.some(({ usage }) => usage === "content")
      || !effectiveSources.some(({ usage }) => usage === "style")
    )) {
      return { ok: false as const, error: { code: "missing_input" as const } };
    }
    const contentAnalyses = effectiveSources.flatMap(({ source, usage }) =>
      usage !== "style" && source.contentAnalysis ? [source.contentAnalysis] : []
    );
    const effectiveFormat = preparation.data.settings.formatMode === "auto"
      ? inferCreativeWorkFormat(contentAnalyses, aggregate.work.request) ?? preparation.data.format
      : preparation.data.format;
    const snapshot = {
      request: aggregate.work.request,
      settings: preparation.data.settings,
      sources: effectiveSources.map(({ source, usage }) => ({
        sourceId: source.id,
        updatedAt: source.updatedAt.toISOString(),
        assetKey: sourceAssets.get(source.id)?.assetKey ?? null,
        mimeType: sourceAssets.get(source.id)?.mimeType ?? null,
        usage,
        content: source.contentAnalysis,
        style: source.styleAnalysis,
      })),
    };
    const quote = quoteCreativeWork({
      intent: preparation.data.intent,
      format: effectiveFormat,
      targetFormats: preparation.data.settings.targetFormats,
    });
    if (
      JSON.stringify(aggregate.work.inputSnapshot) === JSON.stringify(snapshot) &&
      aggregate.work.format === effectiveFormat &&
      socialPostBriefSchema.safeParse(aggregate.work.brief).success &&
      socialPostCopySchema.safeParse(aggregate.work.copy).success
    ) {
      return { ok: true as const, value: { work: aggregate.work, quote } };
    }
    const parsedBrief = socialPostBriefSchema.safeParse(inferSocialPostBrief(
      aggregate.work.request,
      contentAnalyses,
    ));
    if (!parsedBrief.success) {
      return { ok: false as const, error: { code: "invalid_preparation" as const } };
    }
    const brandKit = await getBrandKit(input.workspaceId, aggregate.work.clientProfileId, executor);
    const copy = await generateSocialPostCopy({
      brief: parsedBrief.data,
      brandName: brandKit?.name ?? "Marca",
      toneOfVoice: brandKit?.toneOfVoice ?? null,
      requiredElements: brandKit?.requiredElements ?? null,
      prohibitedElements: brandKit?.prohibitedElements ?? null,
    });
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
    return { ok: true as const, value: { work, quote } };
  });
}
