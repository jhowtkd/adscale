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

import { NonRetriableError, RetryAfterError } from "inngest";
import { isRasterRetry } from "@/server/equipe/handoff/raster-image";

type Input = { workspaceId: string; workItemId: string; sourceId: string };

const controlledSourceFailures = new Set<string>();

async function reloadCreativeWorkSource(input: Input) {
  const current = await getCreativeWork(input.workspaceId, input.workItemId);
  return current?.sources.find((candidate) => candidate.id === input.sourceId) ?? null;
}

export type SourceAnalysisExecution = {
  attempt: number;
  run: <T>(id: string, action: () => Promise<T>) => Promise<T>;
};
export const SOURCE_ANALYSIS_MAX_ATTEMPTS = 3;
export const SOURCE_ANALYSIS_BACKOFF_SECONDS = [15, 30] as const;

export async function analyzeCreativeWorkSource(input: Input, execution?: SourceAnalysisExecution) {
  const run = <T>(id: string, action: () => Promise<T>): Promise<T> => {
    if (!execution) return action();
    return execution.run(id, async () => {
      try { return await action(); }
      catch (error) {
        if (error instanceof RetryAfterError || error instanceof NonRetriableError) throw error;
        throw new NonRetriableError(error instanceof Error ? error.message : "analysis_failed", { cause: error });
      }
    });
  };
  // Every retry of the analysis step must reuse the same memoized CAS.
  const claimed = await run("claim-source", async () => {
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
    const source = aggregate?.sources.find((candidate) => candidate.id === input.sourceId);
    if (!source || !aggregate) {
      if (execution) return { skipped: null } as const;
      throw new Error("creative_work_source_not_found");
    }
    const work = aggregate.work;

    if (source.status !== "uploaded") return { skipped: source } as const;
    const analyzing = await updateCreativeWorkSourceIfUnchanged(
      input.workspaceId,
      input.workItemId,
      input.sourceId,
      { status: source.status, usage: source.usage, updatedAt: source.updatedAt },
      { status: "analyzing", failureCode: null },
    );
    if (!analyzing) return { skipped: await reloadCreativeWorkSource(input) } as const;
    return { source, work, analyzing } as const;
  });
  if ("skipped" in claimed) return claimed.skipped;
  const { source, work, analyzing } = claimed;
  const attempt = { status: analyzing.status, usage: analyzing.usage, updatedAt: new Date(analyzing.updatedAt) };
  let providerStarted = false;
  const fail = async (error: unknown, retry: boolean): Promise<null> => {
    // Durable retries retain ownership of the original claim. Synchronous
    // callers have no executor to resume them and retain their existing policy.
    if (!retry || !execution) {
      // A failed diagnostic read must not prevent us from releasing our claim.
      const ended = await updateCreativeWorkSourceIfUnchanged(input.workspaceId, input.workItemId, input.sourceId, attempt,
        retry ? { status: "uploaded", failureCode: null } : { status: "failed", failureCode: "analysis_failed" });
      if (execution && !ended && !await reloadCreativeWorkSource(input)) return null;
    } else {
      try {
        if (!await reloadCreativeWorkSource(input)) return null;
      } catch (readError) {
        // This is a repository failure, not proof that the source was removed.
        // Terminate through the same CAS-first path instead of retrying the queue.
        return fail(readError, false);
      }
    }
    if (!execution) throw error;
    // 3 × 45s queue waits + 15s + 30s backoffs = 180s, leaving 120s
    // for the provider/persist before the unchanged 300s stale-source lease.
    if (retry) throw new RetryAfterError(error instanceof Error ? error.message : "raster_retry:unavailable", `${SOURCE_ANALYSIS_BACKOFF_SECONDS[execution.attempt === 0 ? 0 : 1]}s`, { cause: error });
    throw new NonRetriableError(error instanceof Error ? error.message : "analysis_failed", { cause: error });
  };
  // Persist the result checkpoint before any repository write after the paid calls.
  const patch = await run("analyze-source-result", async () => {
    try {
      if (!await reloadCreativeWorkSource(input)) return null;
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
        const normalized = await normalizeImageForAi({ accountKey: `classic:${input.workspaceId}`,
          buffer: rawBuffer,
          mimeType: asset.type,
        });
        // A source classified for Single Piece may become an exact mark. Its
        // persisted readiness must use real alpha pixels, not channel presence.
        const hasUsableTransparency = work.toolKind === "single"
          ? await inspectUsableTransparency(rawBuffer, `classic:${input.workspaceId}`)
          : normalized.hasTransparency;
        if (!await reloadCreativeWorkSource(input)) return null;
        providerStarted = true;
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
      return { status: "ready" as const, contentAnalysis, styleAnalysis, pieceReference, failureCode: null };
    } catch (error) {
      const retry = isRasterRetry(error) && !providerStarted && (!execution || execution.attempt < SOURCE_ANALYSIS_MAX_ATTEMPTS - 1);
      return fail(error, retry);
    }
  });
  if (patch === null) return null;
  return run("persist-source-analysis", async () => {
    try {
      const ready = await updateCreativeWorkSourceIfUnchanged(input.workspaceId, input.workItemId, input.sourceId, attempt, patch);
      if (ready) return ready;
      const current = await reloadCreativeWorkSource(input);
      if (!current) return null;
      if (current.status === attempt.status && current.usage === attempt.usage &&
          new Date(current.updatedAt).getTime() === attempt.updatedAt.getTime()) {
        // A lost write must not report success while our own claim is stranded.
        // The catch terminates it with the original CAS, without another call.
        throw new Error("creative_work_source_persist_failed");
      }
      return current;
    } catch (error) {
      // Handle this inside the step callback: the SDK does not return a failed
      // step to the enclosing catch until its executor has exhausted retries.
      return fail(error, false);
    }
  });
}
