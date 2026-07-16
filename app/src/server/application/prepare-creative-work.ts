import { generateSocialPostCopy } from "@/server/creative-work/copy";
import {
  deriveCreativeWorkTitle,
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
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";

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
    const snapshot = {
      request: aggregate.work.request,
      settings: preparation.data.settings,
      sources: readySources.map((source) => ({
        sourceId: source.id,
        updatedAt: source.updatedAt.toISOString(),
        assetKey: null,
        mimeType: null,
        usage: source.usage,
        content: source.contentAnalysis,
        style: source.styleAnalysis,
      })),
    };
    const quote = quoteCreativeWork({
      intent: preparation.data.intent,
      format: preparation.data.format,
      targetFormats: preparation.data.settings.targetFormats,
    });
    if (
      JSON.stringify(aggregate.work.inputSnapshot) === JSON.stringify(snapshot) &&
      socialPostBriefSchema.safeParse(aggregate.work.brief).success &&
      socialPostCopySchema.safeParse(aggregate.work.copy).success
    ) {
      return { ok: true as const, value: { work: aggregate.work, quote } };
    }
    const parsedBrief = socialPostBriefSchema.safeParse(inferSocialPostBrief(
      aggregate.work.request,
      readySources.flatMap((source) => source.contentAnalysis ? [source.contentAnalysis] : []),
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
        settings: preparation.data.settings,
        inputSnapshot: snapshot,
      },
      executor,
    );
    if (!work) return { ok: false as const, error: { code: "stale_input" as const } };
    return { ok: true as const, value: { work, quote } };
  });
}
