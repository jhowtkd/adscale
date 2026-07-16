import {
  analyzeImageContent,
  analyzeImageStyle,
  contentBriefSchema,
  styleBriefSchema,
  type ContentBrief,
  type StyleBrief,
} from "@/server/ai/image-analysis";
import { getCreativeWork, updateCreativeWorkSourceIfUnchanged } from "@/server/repositories/creative-work";
import { getTemplateById } from "@/server/repositories/template";
import { getWorkspaceAssetById } from "@/server/repositories/workspace-asset";
import { objectStorage } from "@/server/storage";

type Input = { workspaceId: string; workItemId: string; sourceId: string };

export async function analyzeCreativeWorkSource(input: Input) {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  const source = aggregate?.sources.find((candidate) => candidate.id === input.sourceId);
  if (!source) throw new Error("creative_work_source_not_found");

  if (source.status !== "uploaded") return null;
  const analyzing = await updateCreativeWorkSourceIfUnchanged(
    input.workspaceId,
    input.workItemId,
    input.sourceId,
    { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
    { status: "analyzing", failureCode: null },
  );
  if (!analyzing) return null;
  const attempt = { status: analyzing.status, usage: analyzing.usage, updatedAt: analyzing.updatedAt };

  try {
    let contentAnalysis: ContentBrief | null = null;
    let styleAnalysis: StyleBrief | null = null;
    if (source.assetId) {
      const asset = await getWorkspaceAssetById(source.assetId, input.workspaceId);
      if (!asset || !asset.type.startsWith("image/")) throw new Error("creative_work_source_origin_invalid");
      const bytes = await objectStorage.get(asset.key);
      const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const [contentResult, styleResult] = await Promise.all([
        source.usage !== "style" ? analyzeImageContent(buffer, asset.type) : null,
        source.usage !== "content" ? analyzeImageStyle(buffer, asset.type) : null,
      ]);
      contentAnalysis = contentResult ? contentBriefSchema.parse(contentResult) : null;
      styleAnalysis = styleResult ? styleBriefSchema.parse(styleResult) : null;
    } else {
      const template = source.templateId ? await getTemplateById(source.templateId, input.workspaceId) : null;
      if (!template) throw new Error("creative_work_source_origin_invalid");
      if (source.usage !== "style") {
        contentAnalysis = contentBriefSchema.parse({
          product: template.product ?? "",
          offer: template.offer ?? "",
          cta: { text: (template.ctaVariants ?? []).join(", "), style: "template" },
          brandElements: [],
          keyVisual: template.objective ?? "",
          textContent: { headline: template.objective ?? "", bullets: [template.audience ?? ""].filter(Boolean) },
          format: (template.targetFormats ?? []).join(", "),
        });
      }
      if (source.usage !== "content") {
        styleAnalysis = styleBriefSchema.parse({
          colorPalette: { dominant: [], accents: [], gradients: "" },
          typography: { personality: template.tone ?? "", effects: [] },
          textures: [],
          composition: template.styleIntensity,
          mood: template.tone ?? "",
          decorativeElements: [],
          photoTreatment: "",
        });
      }
    }
    return await updateCreativeWorkSourceIfUnchanged(
      input.workspaceId,
      input.workItemId,
      input.sourceId,
      attempt,
      { status: "ready", contentAnalysis, styleAnalysis, failureCode: null },
    );
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
