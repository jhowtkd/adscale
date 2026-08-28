import {
  analyzeImageContent,
  analyzeImageStyle,
  contentBriefSchema,
  normalizeContentBrief,
  normalizeStyleBrief,
  styleBriefSchema,
  type ContentBrief,
  type StyleBrief,
} from "@/server/ai/image-analysis";
import { inspectUsableTransparency, normalizeImageForAi } from "@/server/ai/normalize-image-for-ai";
import { getCreativeWork, updateCreativeWorkSourceIfUnchanged } from "@/server/repositories/creative-work";
import { getTemplateById } from "@/server/repositories/template";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";
import { isE2EControlledProviderEnabled } from "@/server/ai/providers/e2e-controlled-provider";

type Input = { workspaceId: string; workItemId: string; sourceId: string };

const controlledSourceFailures = new Set<string>();

async function reloadCreativeWorkSource(input: Input, fallback: NonNullable<Awaited<ReturnType<typeof getCreativeWork>>>["sources"][number]) {
  const current = await getCreativeWork(input.workspaceId, input.workItemId);
  return current?.sources.find((candidate) => candidate.id === input.sourceId) ?? fallback;
}

export async function analyzeCreativeWorkSource(input: Input) {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  const source = aggregate?.sources.find((candidate) => candidate.id === input.sourceId);
  if (!source || !aggregate) throw new Error("creative_work_source_not_found");
  const work = aggregate.work;

  if (source.status !== "uploaded") return source;
  const analyzing = await updateCreativeWorkSourceIfUnchanged(
    input.workspaceId,
    input.workItemId,
    input.sourceId,
    { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
    { status: "analyzing", failureCode: null },
  );
  if (!analyzing) return reloadCreativeWorkSource(input, source);
  const attempt = { status: analyzing.status, usage: analyzing.usage, updatedAt: analyzing.updatedAt };

  try {
    let contentAnalysis: ContentBrief | null = null;
    let styleAnalysis: StyleBrief | null = null;
    let pieceReference = source.pieceReference;
    if (source.assetId) {
      const asset = await getWorkspaceAssetById(source.assetId, input.workspaceId);
      if (!asset || !asset.type.startsWith("image/")) throw new Error("creative_work_source_origin_invalid");
      if (
        isE2EControlledProviderEnabled() &&
        asset.name.includes("e2e-source-fail-once") &&
        !controlledSourceFailures.has(source.id)
      ) {
        controlledSourceFailures.add(source.id);
        throw new Error("controlled_source_analysis_failure");
      }
      const bytes = await objectStorage.get(asset.key);
      const rawBuffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const normalized = await normalizeImageForAi({
        buffer: rawBuffer,
        mimeType: asset.type,
      });
      // A source classified for Single Piece may become an exact mark. Its
      // persisted readiness must use real alpha pixels, not channel presence.
      const hasUsableTransparency = work.toolKind === "single"
        ? await inspectUsableTransparency(rawBuffer)
        : normalized.hasTransparency;
      const [contentResult, styleResult] = await Promise.all([
        source.usage !== "style"
          ? analyzeImageContent(normalized.buffer, normalized.mimeType, {
              classifyPieceReference: work.toolKind === "single",
            })
          : null,
        source.usage !== "content" ? analyzeImageStyle(normalized.buffer, normalized.mimeType) : null,
      ]);
      const { pieceReference: classified, ...contentWithoutPieceReference } = contentResult ?? {};
      contentAnalysis = contentResult ? normalizeContentBrief(contentBriefSchema.parse(contentWithoutPieceReference)) : null;
      styleAnalysis = styleResult ? normalizeStyleBrief(styleBriefSchema.parse(styleResult)) : null;
      pieceReference = work.toolKind === "single"
        ? {
            version: 1 as const,
            category: classified?.category ?? null,
            classificationSource: "automatic" as const,
            confidence: classified?.confidence ?? "low",
            userInstruction: source.pieceReference?.userInstruction ?? null,
            hasTransparency: hasUsableTransparency,
          }
        : source.pieceReference;
    } else {
      const template = source.templateId ? await getTemplateById(source.templateId, input.workspaceId) : null;
      if (!template) throw new Error("creative_work_source_origin_invalid");
      if (source.usage !== "style") {
        contentAnalysis = normalizeContentBrief(contentBriefSchema.parse({
          product: template.product ?? "",
          offer: template.offer ?? "",
          cta: { text: (template.ctaVariants ?? []).join(", "), style: "template" },
          brandElements: [],
          keyVisual: template.objective ?? "",
          textContent: { headline: template.objective ?? "", bullets: [template.audience ?? ""].filter(Boolean) },
          format: (template.targetFormats ?? []).join(", "),
        }));
      }
      if (source.usage !== "content") {
        styleAnalysis = normalizeStyleBrief(styleBriefSchema.parse({
          colorPalette: { dominant: [], accents: [], gradients: "" },
          typography: { personality: template.tone ?? "", effects: [] },
          textures: [],
          composition: template.styleIntensity,
          mood: template.tone ?? "",
          decorativeElements: [],
          photoTreatment: "",
        }));
      }
    }
    const ready = await updateCreativeWorkSourceIfUnchanged(
      input.workspaceId,
      input.workItemId,
      input.sourceId,
      attempt,
      { status: "ready", contentAnalysis, styleAnalysis, pieceReference, failureCode: null },
    );
    return ready ?? reloadCreativeWorkSource(input, analyzing);
  } catch (error) {
    await updateCreativeWorkSourceIfUnchanged(
      input.workspaceId,
      input.workItemId,
      input.sourceId,
      attempt,
      { status: "failed", failureCode: "analysis_failed" },
    );
    throw error;
  }
}
