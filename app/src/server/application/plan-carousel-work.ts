import "server-only";
import type { CarouselDraftStateV1 } from "../creative-work/carousel-contracts";
import type { CarouselEditorialFinding } from "../creative-work/carousel-editorial";
import {
  CarouselEditorialPlanInvalidError,
  lintCarouselDeck,
  proposeCarouselDraft,
} from "../creative-work/carousel-editorial";
import {
  buildCreativeWorkFactPack,
  creativeWorkFactPackBrandFromKit,
} from "../creative-work/fact-pack";
import type { CreativeWorkItem } from "../db/schema";
import {
  getCreativeWork,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "../repositories/creative-work";
import { getBrandKit } from "../repositories/brand-kit";
import { withInvalidatedCarouselApprovals } from "../creative-work/carousel-editorial-state";

export type PlanCarouselWorkErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "work_not_draft"
  | "sources_not_ready"
  | "stale_input"
  | "editorial_plan_invalid";

export type PlanCarouselWorkResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        draft: CarouselDraftStateV1;
        findings: CarouselEditorialFinding[];
      };
    }
  | { ok: false; error: { code: PlanCarouselWorkErrorCode; details?: unknown } };

/**
 * Loads the grounded context, asks only the planner's blocking questions and
 * persists the editable carousel draft in `settings.carouselDraft` through the
 * draft CAS. Runs under the existing per-work prepare lock and never touches
 * billing, Inngest or the image provider.
 */
export async function planCarouselWork(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: string;
  answers: Record<string, string>;
}): Promise<PlanCarouselWorkResult> {
  return withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, executor);
    if (!aggregate) return { ok: false as const, error: { code: "work_not_found" as const } };
    const { work } = aggregate;
    if (work.toolKind !== "carousel") {
      return {
        ok: false as const,
        error: { code: "work_not_carousel" as const, details: { toolKind: work.toolKind } },
      };
    }
    if (work.status !== "draft") {
      return {
        ok: false as const,
        error: { code: "work_not_draft" as const, details: { status: work.status } },
      };
    }
    if (aggregate.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) {
      return { ok: false as const, error: { code: "sources_not_ready" as const } };
    }
    if (work.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      return { ok: false as const, error: { code: "stale_input" as const } };
    }

    const previous = work.settings.carouselDraft ?? null;
    const mergedAnswers = { ...(previous?.answers ?? {}), ...input.answers };
    const answerLines = Object.entries(mergedAnswers).map(([field, value]) => `${field}: ${value.trim()}`);
    const requestContext = [work.request.trim(), ...answerLines]
      .filter((line) => line.length > 0)
      .join("\n");

    // Only content|both sources are factual. A style source stays visual
    // context metadata for the later visual contract and never enters the
    // fact pack.
    const factualSources = aggregate.sources
      .filter((source) => source.status === "ready" && source.usage !== "style")
      .map((source) => ({ sourceId: source.id, usage: source.usage, content: source.contentAnalysis }));

    const brandKit = await getBrandKit(input.workspaceId, work.clientProfileId, executor);
    const factPack = buildCreativeWorkFactPack({
      request: requestContext,
      mode: "social_post",
      sources: factualSources,
      brand: creativeWorkFactPackBrandFromKit(brandKit),
      clientProfileId: work.clientProfileId,
    });

    let draft: CarouselDraftStateV1;
    try {
      draft = await proposeCarouselDraft({
        workId: work.id,
        request: requestContext,
        answers: mergedAnswers,
        previous,
        factPack,
        toneOfVoice: brandKit?.toneOfVoice ?? null,
      });
    } catch (error) {
      if (error instanceof CarouselEditorialPlanInvalidError) {
        // Keep the last persisted draft: an untrustworthy plan never writes.
        return {
          ok: false as const,
          error: {
            code: "editorial_plan_invalid" as const,
            details: { message: error.message },
          },
        };
      }
      throw error;
    }

    const findings = draft.plan ? lintCarouselDeck({ deck: draft.plan, factPack }) : [];

    const updated = await updateCreativeWorkDraftIfUnchanged(
      input.workspaceId,
      input.workItemId,
      work.updatedAt,
      { settings: { ...withInvalidatedCarouselApprovals(work.settings), carouselDraft: draft } },
      executor,
    );
    if (!updated) return { ok: false as const, error: { code: "stale_input" as const } };
    return { ok: true as const, value: { work: updated, draft, findings } };
  });
}
