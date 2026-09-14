import "server-only";
import { createHash } from "node:crypto";
import type { CreativeWorkItem } from "../db/schema";
import {
  quoteCarouselDeck,
  resolveCarouselPreparedSnapshot,
  validateCarouselDeckStructure,
  validateTextFieldsAgainstFactPack,
  type CarouselDeckPlanV1,
  type CarouselGenerationScope,
  type CarouselVisualContractV1,
} from "../creative-work/carousel-contracts";
import { ART_REFINEMENT_UNITS_PER_ROOT } from "../creative-work/art-refinement";
import { lintCarouselDeck } from "../creative-work/carousel-editorial";
import {
  hasCurrentApprovedCarouselCover,
  readCarouselEditorial,
  storyboardCoversDeck,
} from "../creative-work/carousel-editorial-state";
import { buildCarouselVisualContract } from "../creative-work/carousel-visual";
import { canonicalJsonStringify } from "../creative-work/canonical-json";
import type { CreativeWorkInputSnapshot } from "../creative-work/contracts";
import { resolveGenerationPolicyVersion } from "../creative-work/contracts";
import {
  buildCreativeWorkFactPack,
  creativeWorkFactPackBrandFromKit,
} from "../creative-work/fact-pack";
import { createIdentitySnapshot } from "../creative-work/identity";
import { shouldIncludePublishedBrandKnowledge } from "../creative-work/identity-policy";
import {
  peopleCatalogSchema,
  resolveBriefingPeople,
  type BriefingPeopleError,
} from "../brand-training/people";
import {
  composeVisualDirection,
  repertoireMotifs,
  resolveWorkVisualLanguage,
  visualRepertoireSchema,
  type WorkVisualLanguageError,
} from "../brand-training/visual-repertoire";
import {
  getCreativeWork,
  getCreativeWorkSourceAssetDetails,
  updateCreativeWorkDraftIfUnchanged,
  updateCreativeWorkIfUnchanged,
  withCreativeWorkPreparationLock,
} from "../repositories/creative-work";
import { getBrandKit } from "../repositories/brand-kit";
import { getActiveBrandKnowledgeVersion } from "../repositories/brand-knowledge";
import { resolveImageRenderPolicy, selectImageRenderPolicy } from "../ai/image-render-policy";
import { env } from "../validation/env";

export type PrepareCarouselWorkErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "work_not_draft"
  | "sources_not_ready"
  | "temporary_reference_limit"
  | "blocking_questions"
  | "editorial_invalid"
  | "invalid_context"
  | "invalid_generation_gate"
  | "stale_input"
  | "person_unknown"
  | "person_ambiguous"
  | "person_unconfirmed"
  | "person_limit"
  | "visual_language_unknown"
  | "visual_language_ambiguous";

export type PrepareCarouselWorkResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        preparedRevision: string;
        deck: CarouselDeckPlanV1;
        visualContract: CarouselVisualContractV1;
      };
    }
  | {
      ok: false;
      error:
        | { code: Exclude<PrepareCarouselWorkErrorCode, BriefingPeopleError["code"] | WorkVisualLanguageError["code"]>; details?: unknown }
        | BriefingPeopleError
        | WorkVisualLanguageError;
    };

/** Compare snapshots ignoring the policy version, which is checked separately. */
function withoutPolicyVersion(snapshot: CreativeWorkInputSnapshot | null) {
  const rest = { ...snapshot, renderPolicy: resolveImageRenderPolicy(snapshot?.renderPolicy) };
  delete rest.generationPolicyVersion;
  return {
    ...rest,
    carousel: rest.carousel ? { ...rest.carousel, preparedRevision: undefined } : undefined,
  };
}

function freezeImageRenderPolicy(input: {
  workspaceId: string;
  snapshot: CreativeWorkInputSnapshot | null | undefined;
  brief: unknown;
  copy: unknown;
}) {
  if (input.snapshot?.renderPolicy) {
    return resolveImageRenderPolicy(input.snapshot.renderPolicy);
  }
  const alreadyPrepared = Boolean(
    input.snapshot?.generationPolicyVersion ||
    (input.brief && input.copy) ||
    input.snapshot?.carousel,
  );
  if (alreadyPrepared) return resolveImageRenderPolicy(undefined);
  return selectImageRenderPolicy(
    input.workspaceId,
    env.OPENAI_IMAGE_SUNBURST_PERCENT,
    env.OPENAI_IMAGE_SUNBURST_QUALITY,
  );
}

/**
 * Freezes the carousel rhythm system: validates the approved deck, rebuilds
 * the fact pack from request + content authorities (style-only facts are
 * rejected), lints the deck, validates every slide claim against the facts,
 * creates the identity snapshot with published Brand Cortex enabled, builds
 * the visual contract and persists identity + deck + contract with one
 * prepared revision while the work stays `draft`. Runs under the existing
 * per-work prepare lock and never touches billing, Inngest or the image
 * provider — generation confirmation owns every later transition.
 */
export async function prepareCarouselWork(input: {
  workspaceId: string;
  workItemId: string;
  /**
   * Explicit user opt-in to automatic art refinement (plan 04, T4): the
   * accepting user id. Absent/blank preserves legacy generation exactly.
   */
  artRefinement?: { acceptedBy: string };
}): Promise<PrepareCarouselWorkResult> {
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
    const editorial = readCarouselEditorial(work.settings);
    const approvedScriptRevision = editorial?.approvedScriptRevision ?? null;
    if (!editorial || !approvedScriptRevision || approvedScriptRevision !== editorial.revision) {
      return {
        ok: false as const,
        error: { code: "invalid_generation_gate" as const, details: { reason: "script_not_approved" } },
      };
    }
    const currentSnapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
    const coverSlideId = editorial.approvedCover?.slideId ?? null;
    const interiorsReady = Boolean(
      coverSlideId
      && hasCurrentApprovedCarouselCover(
        editorial,
        approvedScriptRevision,
        editorial.approvedCover?.preparedRevision ?? "",
        coverSlideId,
      )
      && currentSnapshot
      && editorial.approvedCover?.preparedRevision === currentSnapshot.preparedRevision,
    );
    const generationScope: CarouselGenerationScope = interiorsReady ? "interiors" : "cover";
    if (generationScope === "cover" && work.status !== "draft") {
      return {
        ok: false as const,
        error: { code: "work_not_draft" as const, details: { status: work.status } },
      };
    }
    if (generationScope === "interiors" && (work.status === "completed" || work.status === "failed")) {
      return {
        ok: false as const,
        error: { code: "invalid_generation_gate" as const, details: { status: work.status } },
      };
    }
    if (aggregate.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) {
      return { ok: false as const, error: { code: "sources_not_ready" as const } };
    }

    // At most one temporary visual reference exists per carousel draft (the
    // repository caps creation); prepare re-checks it against the aggregate.
    const activeSources = aggregate.sources.filter((source) => source.status !== "failed");
    if (activeSources.length > 1) {
      return {
        ok: false as const,
        error: { code: "temporary_reference_limit" as const, details: { count: activeSources.length } },
      };
    }
    const temporaryReferenceId = activeSources[0]?.id ?? null;

    const draft = work.settings.carouselDraft ?? null;
    if (!draft) {
      return {
        ok: false as const,
        error: { code: "editorial_invalid" as const, details: { reason: "carousel_draft_missing" } },
      };
    }
    if (!draft.plan) {
      if (draft.blockingQuestions.length > 0) {
        return {
          ok: false as const,
          error: {
            code: "blocking_questions" as const,
            details: { questions: draft.blockingQuestions },
          },
        };
      }
      return {
        ok: false as const,
        error: { code: "editorial_invalid" as const, details: { reason: "carousel_plan_missing" } },
      };
    }
    const deck = draft.plan;

    const structuralFindings = validateCarouselDeckStructure(deck);
    if (structuralFindings.length > 0) {
      return {
        ok: false as const,
        error: { code: "editorial_invalid" as const, details: { findings: structuralFindings } },
      };
    }

    if (editorial.storyboard.length > 0) {
      if (!storyboardCoversDeck(editorial.storyboard, deck.slides.map((slide) => slide.slideId))) {
        return {
          ok: false as const,
          error: { code: "editorial_invalid" as const, details: { reason: "storyboard_incomplete" } },
        };
      }
      const knownClaimIds = new Set(editorial.research.claims.map((claim) => claim.id));
      const missingClaimIds = [...new Set(
        editorial.storyboard.flatMap((item) => item.claimIds.filter((claimId) => !knownClaimIds.has(claimId))),
      )];
      if (missingClaimIds.length > 0) {
        return {
          ok: false as const,
          error: {
            code: "editorial_invalid" as const,
            details: { reason: "missing_claim_reference", claimIds: missingClaimIds },
          },
        };
      }
    }

    if (generationScope === "interiors" && currentSnapshot && work.inputSnapshot) {
      if (
        currentSnapshot.generationScope === "interiors"
        && currentSnapshot.scriptRevision === approvedScriptRevision
      ) {
        return {
          ok: true as const,
          value: {
            work,
            preparedRevision: currentSnapshot.preparedRevision,
            deck: currentSnapshot.deck,
            visualContract: currentSnapshot.visualContract,
          },
        };
      }
      const snapshot: CreativeWorkInputSnapshot = {
        ...work.inputSnapshot,
        carousel: {
          ...currentSnapshot,
          generationScope: "interiors",
          scriptRevision: approvedScriptRevision,
        },
      };
      const updated = await updateCreativeWorkIfUnchanged(
        input.workspaceId,
        input.workItemId,
        work.updatedAt,
        { inputSnapshot: snapshot },
        executor,
      );
      if (!updated) return { ok: false as const, error: { code: "stale_input" as const } };
      return {
        ok: true as const,
        value: {
          work: updated,
          preparedRevision: currentSnapshot.preparedRevision,
          deck: currentSnapshot.deck,
          visualContract: currentSnapshot.visualContract,
        },
      };
    }

    // Only content|both sources are factual. The single style source stays
    // visual context metadata for the visual contract and never contributes
    // factual truth.
    const factualSources = aggregate.sources
      .filter((source) => source.status === "ready" && source.usage !== "style")
      .map((source) => ({ sourceId: source.id, usage: source.usage, content: source.contentAnalysis }));
    const answerLines = Object.entries(draft.answers).map(([field, value]) => `${field}: ${value.trim()}`);
    const requestContext = [work.request.trim(), ...answerLines]
      .filter((line) => line.length > 0)
      .join("\n");

    const brandKit = await getBrandKit(input.workspaceId, work.clientProfileId, executor);
    const factPack = buildCreativeWorkFactPack({
      request: requestContext,
      mode: "social_post",
      sources: factualSources,
      brand: creativeWorkFactPackBrandFromKit(brandKit),
      clientProfileId: work.clientProfileId,
    });

    // Named people (plan 03, T2) and trained visual language (plan 02, T3):
    // deck mentions resolve against the FROZEN published catalog and
    // repertoire into mandatory presence and a frozen direction. Unknown and
    // ambiguous mentions block preparation with clarification payloads,
    // before persistence or any image call — the same contract as the
    // single-piece path, over request + answers + slide texts.
    const deckMentionText = [
      requestContext,
      ...deck.slides.flatMap((slide) => [slide.purpose, slide.primaryText, slide.secondaryText ?? ""]),
    ].join("\n");
    const activeVersion = work.clientProfileId
      ? await getActiveBrandKnowledgeVersion(input.workspaceId, work.clientProfileId)
      : null;
    const publishedClaims = activeVersion?.snapshot.claims ?? [];
    const peopleCatalogValue = publishedClaims
      .find((claim) => claim.claimKey === "people.catalog")?.value;
    const peopleCatalog = peopleCatalogValue === undefined
      ? null
      : peopleCatalogSchema.safeParse(peopleCatalogValue).success
        ? peopleCatalogSchema.parse(peopleCatalogValue)
        : null;
    const briefingPeople = resolveBriefingPeople({
      catalog: peopleCatalog,
      personIds: work.settings.personIds,
      text: deckMentionText,
      textOnly: work.settings.personTextOnly,
    });
    if (!briefingPeople.ok) {
      return { ok: false as const, error: briefingPeople.error };
    }
    const repertoireValue = publishedClaims
      .find((claim) => claim.claimKey === "visual.repertoire")?.value;
    const repertoire = repertoireValue === undefined
      ? null
      : visualRepertoireSchema.safeParse(repertoireValue).success
        ? visualRepertoireSchema.parse(repertoireValue)
        : null;
    const workLanguage = resolveWorkVisualLanguage({
      repertoire,
      explicitId: work.settings.visualLanguageId,
      text: deckMentionText,
    });
    if (!workLanguage.ok) {
      return { ok: false as const, error: workLanguage.error };
    }
    const visualDirection = repertoire
      ? composeVisualDirection({ repertoire, language: workLanguage.language })
      : null;
    const contractMotifs = repertoire
      ? repertoireMotifs({ repertoire, language: workLanguage.language })
      : [];

    const blockingFindings = lintCarouselDeck({ deck, factPack }).filter((finding) => finding.blocking);
    if (blockingFindings.length > 0) {
      return {
        ok: false as const,
        error: { code: "editorial_invalid" as const, details: { findings: blockingFindings } },
      };
    }
    const violations = validateTextFieldsAgainstFactPack(
      deck.slides.flatMap((slide, index) => [
        { field: `slides.${index}.primaryText`, text: slide.primaryText },
        ...(slide.secondaryText ? [{ field: `slides.${index}.secondaryText`, text: slide.secondaryText }] : []),
      ]),
      factPack,
    );
    if (violations.length > 0) {
      return {
        ok: false as const,
        error: { code: "invalid_context" as const, details: { violations } },
      };
    }

    const identity = await createIdentitySnapshot({
      workspaceId: input.workspaceId,
      clientProfileId: work.clientProfileId,
      // The carousel visual contract reads exact assets and rules from the
      // approved training set; the temporary reference never becomes one.
      selectedReferenceIds: [],
      brief: work.brief,
      format: deck.format,
      includePublishedBrandKnowledge: shouldIncludePublishedBrandKnowledge("carousel"),
    });

    const visualContract = buildCarouselVisualContract({
      format: deck.format,
      identity,
      temporaryReferenceId,
      ...(work.settings.fontAssetKey ? { selectedFontAssetKey: work.settings.fontAssetKey } : {}),
      ...(contractMotifs.length > 0 ? { motifs: contractMotifs } : {}),
    });

    const sourceAssets = await getCreativeWorkSourceAssetDetails(
      input.workspaceId,
      aggregate.sources.filter((source) => source.assetId),
      executor,
    );
    const frozenSources = aggregate.sources
      .filter((source) => source.status === "ready")
      .map((source) => ({
        sourceId: source.id,
        updatedAt: source.updatedAt.toISOString(),
        assetKey: sourceAssets.get(source.id)?.assetKey ?? null,
        mimeType: sourceAssets.get(source.id)?.mimeType ?? null,
        label: sourceAssets.get(source.id)?.name ?? null,
        usage: source.usage,
        // The temporary style reference freezes as visual-only: its content
        // analysis is dropped so no later reader can mine facts from it.
        content: source.usage === "style" ? null : source.contentAnalysis,
        style: source.styleAnalysis,
      }));

    const renderPolicy = freezeImageRenderPolicy({
      workspaceId: input.workspaceId,
      snapshot: work.inputSnapshot,
      brief: work.brief,
      copy: work.copy,
    });

    const preparedRevision = `prep-${createHash("sha256")
      .update(canonicalJsonStringify({
        workId: work.id,
        deck,
        contractHash: visualContract.contractHash,
        factPack,
        sources: frozenSources,
        scriptRevision: approvedScriptRevision,
        storyboard: editorial.storyboard,
        caption: editorial.caption,
        renderPolicy,
      }))
      .digest("hex")
      .slice(0, 24)}`;

    const snapshot: CreativeWorkInputSnapshot = {
      generationPolicyVersion: "quality_recovery_v1",
      renderPolicy,
      factPack,
      ...(briefingPeople.people.length > 0
        ? {
            people: briefingPeople.people.map((person) => ({
              personId: person.id,
              name: person.name,
              referenceIds: [...person.referenceIds],
              primaryReferenceId: person.primaryReferenceId,
              preserve: [...person.preserve],
            })),
          }
        : {}),
      ...(visualDirection ? { visualDirection } : {}),
      request: work.request,
      settings: work.settings,
      sources: frozenSources,
      carousel: {
        version: 1,
        preparedRevision,
        deck,
        visualContract,
        generationScope,
        scriptRevision: approvedScriptRevision,
        storyboard: editorial.storyboard,
        caption: editorial.caption,
      },
    };

    // Plan 04, T4: freeze the accepted refinement budget into the snapshot.
    // The ceiling covers the initial deck (root + two revisions per slide);
    // every slide revision still settles its own canonical unit on dispatch.
    const refinementAcceptedBy = input.artRefinement?.acceptedBy.trim() || null;
    if (refinementAcceptedBy && !work.trainingSessionId) {
      const deckQuote = quoteCarouselDeck(deck.slides.length);
      snapshot.artRefinement = {
        version: 1,
        maxRevisionsPerRoot: 2,
        acceptedCreditCeiling: deckQuote.credits * ART_REFINEMENT_UNITS_PER_ROOT,
        acceptedBy: refinementAcceptedBy,
        acceptedAt: new Date().toISOString(),
      };
    }

    if (
      resolveGenerationPolicyVersion(work.inputSnapshot) === resolveGenerationPolicyVersion(snapshot) &&
      work.inputSnapshot?.carousel &&
      canonicalJsonStringify(withoutPolicyVersion(work.inputSnapshot)) ===
        canonicalJsonStringify(withoutPolicyVersion(snapshot))
    ) {
      const existing = resolveCarouselPreparedSnapshot(work.inputSnapshot);
      if (existing) {
        return {
          ok: true as const,
          value: {
            work,
            preparedRevision: existing.preparedRevision,
            deck: existing.deck,
            visualContract: existing.visualContract,
          },
        };
      }
    }

    const persistSnapshot = generationScope === "cover"
      ? updateCreativeWorkDraftIfUnchanged
      : updateCreativeWorkIfUnchanged;
    const updated = await persistSnapshot(
      input.workspaceId,
      input.workItemId,
      work.updatedAt,
      { identitySnapshot: identity, inputSnapshot: snapshot },
      executor,
    );
    if (!updated) return { ok: false as const, error: { code: "stale_input" as const } };
    return {
      ok: true as const,
      value: { work: updated, preparedRevision, deck, visualContract },
    };
  });
}
