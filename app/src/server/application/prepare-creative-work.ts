import { generateSocialPostCopy } from "@/server/creative-work/copy";
import {
  deriveCreativeWorkTitle,
  inferSocialPostBrief,
  quoteCreativeWork,
} from "@/server/creative-work/prepare";
import { socialPostBriefSchema, socialPostCopySchema } from "@/server/creative-work/contracts";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getCreativeWork, updateCreativeWorkDraft } from "@/server/repositories/creative-work";

export async function prepareCreativeWork(input: { workspaceId: string; workItemId: string }) {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false as const, error: { code: "work_not_found" as const } };
  if (aggregate.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) {
    return { ok: false as const, error: { code: "sources_not_ready" as const } };
  }
  const readySources = aggregate.sources.filter((source) => source.status === "ready");
  if (!aggregate.work.request.trim() && readySources.length === 0) {
    return { ok: false as const, error: { code: "missing_input" as const } };
  }
  const snapshot = {
    request: aggregate.work.request,
    settings: aggregate.work.settings,
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
    intent: aggregate.work.toolKind,
    format: aggregate.work.format,
    targetFormats: aggregate.work.settings.targetFormats,
  });
  if (
    JSON.stringify(aggregate.work.inputSnapshot) === JSON.stringify(snapshot) &&
    socialPostBriefSchema.safeParse(aggregate.work.brief).success &&
    socialPostCopySchema.safeParse(aggregate.work.copy).success
  ) {
    return { ok: true as const, value: { work: aggregate.work, quote } };
  }
  const brief = inferSocialPostBrief(
    aggregate.work.request,
    readySources.flatMap((source) => source.contentAnalysis ? [source.contentAnalysis] : []),
  );
  const brandKit = await getBrandKit(input.workspaceId, aggregate.work.clientProfileId);
  const copy = await generateSocialPostCopy({
    brief,
    brandName: brandKit?.name ?? "Marca",
    toneOfVoice: brandKit?.toneOfVoice ?? null,
    requiredElements: brandKit?.requiredElements ?? null,
    prohibitedElements: brandKit?.prohibitedElements ?? null,
  });
  const work = await updateCreativeWorkDraft(input.workspaceId, input.workItemId, {
    brief,
    copy,
    title: deriveCreativeWorkTitle(brief.theme),
    settings: aggregate.work.settings,
    inputSnapshot: snapshot,
  });
  if (!work) return { ok: false as const, error: { code: "work_not_found" as const } };
  return { ok: true as const, value: { work, quote } };
}
