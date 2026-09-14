import { CreativeCopyContextError, generateSocialPostCopy } from "@/server/creative-work/copy";
import { approvedBrandFontAssets } from "@/server/brand-training/font-assets";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import { preparationInputFingerprint } from "@/server/creative-work/preparation-attempt";
import {
  claimPreparationAttempt,
  finalizePreparationAttempt,
  renewPreparationAttempt,
} from "@/server/repositories/creative-work-preparation";
import { logCreativeWorkPreparationAttempt } from "@/server/creative-work/job-telemetry";

/**
 * Prazo do lease da tentativa de preparacao.
 *
 * 120 s = ~2x o pior caso observado das duas chamadas de modelo desta rota,
 * com margem. NAO e copia dos 90 s do editor de camadas — aquele prazo responde
 * a outra operacao. Revisar contra o p99 real quando houver amostra em
 * docs/operations/reliability-metrics.md, que hoje registra "nao medido".
 */
const PREPARATION_LEASE_SECONDS = 120;

/** Campos fixos da telemetria de tentativa; os identificadores vem do input. */
function preparationTelemetryBase(input: { workspaceId: string; workItemId: string }) {
  return {
    releaseSha: process.env.RENDER_GIT_COMMIT ?? "unknown",
    environment: process.env.NODE_ENV ?? "unknown",
    process: "web" as const,
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
  };
}
import {
  detectCreativeWorkBrandConflict,
  type CreativeWorkBrandConflictDetails,
} from "@/server/creative-work/brand-conflict";
import {
  buildCreativeWorkFactPack,
  creativeWorkFactPackBrandFromKit,
  type CreativeWorkBrandAuthority,
} from "@/server/creative-work/fact-pack";
import { assertOfferActive, mergeCatalogFacts } from "@/server/creative-work/commercial-offer";
import {
  deriveCreativeWorkTitle,
  inferCreativeWorkFormat,
  formatFromDimensions,
  inferSocialPostBrief,
  applyCreativeWorkBriefingOverrides,
  buildInferredBriefing,
} from "@/server/creative-work/prepare";
import { resolveCreativeWorkProtocol } from "@/server/creative-work/protocol";
import {
  buildTypographyPlan,
  TypographyPlanError,
} from "@/server/creative-work/typography-plan";
import { shouldBuildTypographyPlan } from "@/server/creative-work/identity-policy";
import {
  checkInferredBriefing,
  reviewInferredBriefingOnce,
} from "@/server/creative-work/briefing-review";
import { logCreativeWorkBriefingCheck } from "@/server/creative-work/job-telemetry";
import {
  artRefinementCreditCeiling,
  creativeWorkPreparationSchema,
  hasCreativeWorkProtocolSourceShape,
  generationPolicyVersionFromSwitch,
  quoteCreativeWork,
  resolveGenerationPolicyVersion,
  resolveCreativeWorkInferredBriefing,
  socialPostBriefSchema,
  socialPostCopySchema,
  type CreativeSourceStatus,
  type CreativeSourceUsage,
  type CreativeWorkInputSnapshot,
  type SocialPostBrief,
} from "@/server/creative-work/contracts";
import type { ContentBrief } from "@/server/ai/image-analysis";
import { isPieceReferenceReady, pieceReferenceTreatment } from "@/server/creative-work/piece-reference";
import { projectPreparedPlanV1 } from "@/server/creative-work/prepared-plan";
import { getBrandKit } from "@/server/repositories/brand-kit";
import { getActiveBrandKnowledgeVersion } from "@/server/repositories/brand-knowledge";
import { loadCalibrationCandidateForWork } from "@/server/repositories/brand-training-sessions";
import { peopleCatalogSchema, resolveBriefingPeople } from "@/server/brand-training/people";
import {
  composeVisualDirection,
  resolveWorkVisualLanguage,
  visualRepertoireSchema,
} from "@/server/brand-training/visual-repertoire";
import {
  getCreativeWork,
  getCreativeWorkSourceAssetDetails,
  updateCreativeWorkDraftIfUnchanged,
  withCreativeWorkPreparationLock,
} from "@/server/repositories/creative-work";
import { env } from "@/server/validation/env";
import { resolveImageRenderPolicy, selectImageRenderPolicy } from "@/server/ai/image-render-policy";

/** Persisted roles are the only authority for preparation and conflict detection. */
function resolveEffectiveSources<TSource extends { id: string; templateId: string | null; usage: CreativeSourceUsage }>(
  readySources: readonly TSource[],
): Array<{ source: TSource; usage: CreativeSourceUsage }> {
  return readySources.map((source) => ({ source, usage: source.usage }));
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
  const brandKit = await getBrandKit(
    input.workspaceId,
    input.work.clientProfileId,
  );
  return detectCreativeWorkBrandConflict({
    sources: resolveEffectiveSources(readySources)
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
  const rest = { ...snapshot, renderPolicy: resolveImageRenderPolicy(snapshot?.renderPolicy) };
  delete rest.generationPolicyVersion;
  return rest;
}

function withoutBriefing(snapshot: CreativeWorkInputSnapshot | null) {
  const rest = withoutPolicyVersion(snapshot);
  delete rest.inferredBriefing;
  return rest;
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

export async function prepareCreativeWork(input: {
  workspaceId: string;
  workItemId: string;
  /**
   * Explicit user opt-in to automatic art refinement (plan 04, T1): the
   * accepting user id. Absent/blank preserves legacy generation exactly.
   */
  artRefinement?: { acceptedBy: string };
  /**
   * Internal calibration context (plan 01, T2), passed only by the
   * calibration service. Calibration works refuse preparation without the
   * context bound to their own session/round/slot — this is a scoped
   * capability, never a public boolean bypass.
   */
  calibration?: { sessionId: string; round: number; slot: number };
}) {
  const startedAt = Date.now();
  const claimed = await withCreativeWorkPreparationLock(input.workspaceId, input.workItemId, async (executor) => {
    const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, executor);
    if (!aggregate) return { ok: false as const, error: { code: "work_not_found" as const } };
    if (aggregate.work.status !== "draft") {
      return { ok: false as const, error: { code: "work_not_draft" as const } };
    }
    const commercialOffer = aggregate.work.inputSnapshot?.commercialOffer;
    if (commercialOffer) {
      const active = assertOfferActive(commercialOffer, new Date());
      if (!active.ok) return { ok: false as const, error: { code: "offer_expired" as const } };
    }
    if (aggregate.sources.some((source) => source.status === "uploaded" || source.status === "analyzing")) {
      return { ok: false as const, error: { code: "sources_not_ready" as const } };
    }
    if (aggregate.work.toolKind === "single" && aggregate.sources.some((source) => source.assetId && source.status === "failed")) {
      return { ok: false as const, error: { code: "sources_not_ready" as const } };
    }
    const pieceReferences = aggregate.work.toolKind === "single"
      ? aggregate.sources.filter((source) => source.assetId && source.pieceReference)
      : [];
    if (pieceReferences.some((source) => source.pieceReference?.category === "additional_logo_or_seal" && !source.pieceReference.hasTransparency)) {
      return { ok: false as const, error: { code: "piece_reference_exact_incompatible" as const } };
    }
    if (pieceReferences.some((source) => !isPieceReferenceReady(source.pieceReference))) {
      return { ok: false as const, error: { code: "piece_reference_required" as const } };
    }
    if (aggregate.work.toolKind === "single" && aggregate.sources.some((source) => !source.pieceReference && !source.usageConfirmed)) {
      return { ok: false as const, error: { code: "source_usage_required" as const } };
    }
    const readySources = aggregate.sources.filter((source) => source.status === "ready");
    if (aggregate.work.toolKind !== "social_post" && aggregate.work.toolKind !== "carousel"
      && !hasCreativeWorkProtocolSourceShape({
        intent: aggregate.work.toolKind,
        request: aggregate.work.request,
        sources: readySources.map((source) => ({ sourceId: source.id, usage: source.usage })),
      })) {
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
    // Calibration-owned works (plan 01, T2): only the calibration service
    // may prepare them, with the context bound to their persisted link.
    // Generic routes never pass it, so they are refused here.
    const managedTrainingLink = aggregate.work.trainingSessionId
      ? {
          sessionId: aggregate.work.trainingSessionId,
          round: aggregate.work.trainingRound,
          slot: aggregate.work.trainingSlot,
        }
      : null;
    if (
      managedTrainingLink &&
      (input.calibration?.sessionId !== managedTrainingLink.sessionId ||
        input.calibration.round !== managedTrainingLink.round ||
        input.calibration.slot !== managedTrainingLink.slot)
    ) {
      return { ok: false as const, error: { code: "calibration_managed" as const } };
    }
    const calibrationCandidate = managedTrainingLink
      ? await loadCalibrationCandidateForWork(input.workspaceId, input.workItemId)
      : null;
    if (managedTrainingLink && !calibrationCandidate) {
      return { ok: false as const, error: { code: "work_not_found" as const } };
    }
    const effectiveSources = resolveEffectiveSources(readySources);
    // Temporary Single Piece assets are rendering authorities only.  Even
    // when their persisted usage is "both" (the browser never controls it),
    // their vision reading must not become copy/fact authority.
    const factualEffectiveSources = effectiveSources.filter(({ source }) =>
      aggregate.work.toolKind !== "single" || !source.pieceReference,
    );
    const liveBrandKit = await getBrandKit(input.workspaceId, aggregate.work.clientProfileId, executor);
    // Calibration examples compose from the FROZEN candidate, not the live
    // kit: a kit edit after the round was created must not change what the
    // round tests. Only the fields the candidate freezes are overridden.
    const brandKit = calibrationCandidate
      ? {
          ...liveBrandKit,
          brandColors: calibrationCandidate.identity.brandKit.colors,
          brandFonts: calibrationCandidate.identity.brandKit.fonts,
          toneOfVoice: calibrationCandidate.identity.brandKit.toneOfVoice,
          requiredElements: calibrationCandidate.identity.brandKit.requiredElements,
          prohibitedElements: calibrationCandidate.identity.brandKit.prohibitedElements,
        }
      : liveBrandKit;
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
    // Named people (plan 03, T2): briefing names resolve against the frozen
    // published catalog into mandatory presence. Unknown/ambiguous mentions
    // block preparation BEFORE copy, persistence, billing or any image call,
    // with a clarification payload carrying catalog options.
    const activeVersion = !calibrationCandidate && aggregate.work.clientProfileId
      ? await getActiveBrandKnowledgeVersion(input.workspaceId, aggregate.work.clientProfileId)
      : null;
    const catalogValue = (calibrationCandidate
      ? calibrationCandidate.knowledge.claims
      : (activeVersion?.snapshot.claims ?? [])
    ).find((claim) => claim.claimKey === "people.catalog")?.value;
    const catalog = catalogValue === undefined
      ? null
      : peopleCatalogSchema.safeParse(catalogValue).success
        ? peopleCatalogSchema.parse(catalogValue)
        : null;
    const briefingText = [
      aggregate.work.request,
      ...(aggregate.work.brief && typeof aggregate.work.brief === "object"
        ? Object.values(aggregate.work.brief).filter((field): field is string => typeof field === "string")
        : []),
    ].join("\n");
    const briefingPeople = resolveBriefingPeople({
      catalog,
      personIds: preparation.data.settings.personIds,
      // Calibration only exercises the people explicitly selected by its case plan.
      text: calibrationCandidate ? "" : briefingText,
      textOnly: preparation.data.settings.personTextOnly,
    });
    if (!briefingPeople.ok) {
      return { ok: false as const, error: briefingPeople.error };
    }
    // Trained visual language (plan 02, T3): the briefing resolves against
    // the FROZEN repertoire — the published version, or the calibration
    // candidate under test. Unknown explicit ids and ambiguous names block
    // preparation BEFORE copy, persistence, billing or any image call, with a
    // clarification payload carrying repertoire options. Unknown names never
    // block: the piece falls back to the common identity.
    const repertoireValue = (calibrationCandidate
      ? calibrationCandidate.knowledge.claims
      : (activeVersion?.snapshot.claims ?? [])
    ).find((claim) => claim.claimKey === "visual.repertoire")?.value;
    const repertoire = repertoireValue === undefined
      ? null
      : visualRepertoireSchema.safeParse(repertoireValue).success
        ? visualRepertoireSchema.parse(repertoireValue)
        : null;
    const workLanguage = resolveWorkVisualLanguage({
      repertoire,
      explicitId: preparation.data.settings.visualLanguageId,
      // Calibration targets are server-planned; neutral copy must not infer
      // a specialization for a common/person case. Explicit IDs still win.
      text: calibrationCandidate ? "" : briefingText,
    });
    if (!workLanguage.ok) {
      return { ok: false as const, error: workLanguage.error };
    }
    const visualDirection = repertoire
      ? composeVisualDirection({ repertoire, language: workLanguage.language })
      : null;
    const contentSources = factualEffectiveSources.filter(({ usage }) => usage !== "style");
    const contentAnalyses = contentSources.flatMap(({ source }) => source.contentAnalysis ? [source.contentAnalysis] : []);
    const contentAsset = contentSources.length === 1 ? sourceAssets.get(contentSources[0].source.id) : null;
    const sourceFormat = contentAsset ? formatFromDimensions(contentAsset.width, contentAsset.height) : null;
    const effectiveFormat = preparation.data.settings.formatMode === "auto"
      ? inferCreativeWorkFormat(contentAnalyses, aggregate.work.request, sourceFormat) ?? preparation.data.format
      : preparation.data.format;
    const integrated = preparation.data.intent === "single";
    let typographyPlan;
    try {
      typographyPlan = !integrated && shouldBuildTypographyPlan(preparation.data.intent)
        ? buildTypographyPlan({
            format: effectiveFormat,
            requestedLayout: preparation.data.settings.textLayout,
            selectedFontAssetKey: preparation.data.settings.fontAssetKey,
            fonts: approvedBrandFontAssets(brandKit?.brandFontAssets ?? []),
            declaredFontFamilies: (brandKit?.brandFonts as string[] | null | undefined) ?? [],
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
    const factPack = mergeCatalogFacts(buildCreativeWorkFactPack({
      request: aggregate.work.request,
      mode: protocol.mode,
      sources: factualEffectiveSources.map(({ source, usage }) => ({
        sourceId: source.id,
        usage,
        content: source.contentAnalysis,
      })),
      brand: creativeWorkFactPackBrandFromKit(brandKit),
      clientProfileId: aggregate.work.clientProfileId,
      briefingOverrides: preparation.data.settings.briefingOverrides,
      // R-003: a resolved "source" choice makes the art's explicit brand the
      // required identity; otherwise the active brand is registered (and no
      // question ever appears without a confident conflict).
      brandAuthority,
    }), commercialOffer);
    const renderPolicy = freezeImageRenderPolicy({
      workspaceId: input.workspaceId,
      snapshot: aggregate.work.inputSnapshot,
      brief: aggregate.work.brief,
      copy: aggregate.work.copy,
    });
    const snapshotBase: CreativeWorkInputSnapshot = {
      generationPolicyVersion: integrated ? "quality_recovery_v1" : generationPolicyVersionFromSwitch(env.CREATIVE_WORK_QUALITY_RECOVERY_ENABLED),
      ...(integrated ? { creativeRenderPolicy: "integrated_v1" as const } : {}),
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
      ...(typographyPlan ? { typographyPlan } : {}),
      request: aggregate.work.request,
      settings: preparation.data.settings,
      ...(preparation.data.settings.briefingOverrides ? { briefingOverrides: preparation.data.settings.briefingOverrides } : {}),
      ...(commercialOffer ? { commercialOffer } : {}),
      sources: effectiveSources.map(({ source, usage }) => ({
        sourceId: source.id,
        updatedAt: source.updatedAt.toISOString(),
        assetKey: sourceAssets.get(source.id)?.assetKey ?? null,
        mimeType: sourceAssets.get(source.id)?.mimeType ?? null,
        label: sourceAssets.get(source.id)?.name ?? null,
        usage,
        content: source.contentAnalysis,
        style: source.styleAnalysis,
        pieceReference: aggregate.work.toolKind === "single" && source.pieceReference?.category
          ? {
              version: 1,
              category: source.pieceReference.category,
              treatment: pieceReferenceTreatment(source.pieceReference.category),
              userInstruction: source.pieceReference.userInstruction,
              hasTransparency: source.pieceReference.hasTransparency,
            }
          : undefined,
      })),
    };
    // Plan 04, T1: freeze the accepted refinement budget into the snapshot.
    // The ceiling covers n initial outputs (root + two revisions each); the
    // reserve happens only when a unit executes, never upfront. No opt-in, no
    // budget — and calibration works never carry one.
    const refinementAcceptedBy = input.artRefinement?.acceptedBy.trim() || null;
    if (refinementAcceptedBy && !aggregate.work.trainingSessionId && preparation.data.intent !== "carousel") {
      const refinementQuote = quoteCreativeWork({
        intent: preparation.data.intent,
        format: effectiveFormat,
        targetFormats: preparation.data.settings.targetFormats,
        directionPool: preparation.data.settings.directionPool,
      });
      snapshotBase.artRefinement = {
        version: 1,
        maxRevisionsPerRoot: 2,
        acceptedCreditCeiling: artRefinementCreditCeiling(refinementQuote.unitCount),
        acceptedBy: refinementAcceptedBy,
        acceptedAt: new Date().toISOString(),
      };
    }
    const persistedBriefing = resolveCreativeWorkInferredBriefing(aggregate.work.inputSnapshot);
    const persistedBrief = socialPostBriefSchema.safeParse(aggregate.work.brief);
    const persistedCopy = socialPostCopySchema.safeParse(aggregate.work.copy);
    if (
      preparation.data.intent === "single" &&
      persistedBriefing &&
      persistedBrief.success &&
      persistedCopy.success &&
      resolveGenerationPolicyVersion(aggregate.work.inputSnapshot) === resolveGenerationPolicyVersion(snapshotBase) &&
      canonicalJsonStringify(withoutBriefing(aggregate.work.inputSnapshot)) === canonicalJsonStringify(withoutPolicyVersion(snapshotBase)) &&
      aggregate.work.format === effectiveFormat
    ) {
      const quote = quoteCreativeWork({
        intent: preparation.data.intent,
        format: effectiveFormat,
        targetFormats: preparation.data.settings.targetFormats,
        directionPool: preparation.data.settings.directionPool,
      });
      const preparedPlan = projectPreparedPlanV1(aggregate.work);
      if (!preparedPlan) return { ok: false as const, error: { code: "invalid_preparation" as const } };
      return {
        ok: true as const,
        value: {
          briefing: persistedBriefing,
          briefingFactPack: factPack,
          readiness: persistedBriefing.readiness,
          confidence: persistedBriefing.confidence,
          work: aggregate.work,
          quote,
          preparedPlan,
        },
      };
    }
    const inferredBrief = applyCreativeWorkBriefingOverrides(inferSocialPostBrief(
      aggregate.work.request,
      contentAnalyses,
    ), preparation.data.settings.briefingOverrides);
    const parsedBrief = socialPostBriefSchema.safeParse(inferredBrief);
    const effectiveBrief: SocialPostBrief | null = parsedBrief.success ? parsedBrief.data : null;
    if (!parsedBrief.success && preparation.data.intent !== "single") {
      return { ok: false as const, error: { code: "invalid_preparation" as const } };
    }
    const briefing = preparation.data.intent === "single"
      ? buildInferredBriefing({
          request: aggregate.work.request,
          brief: parsedBrief.success ? parsedBrief.data : inferredBrief,
          factPack,
          toneOfVoice: brandAuthority.kind === "source" ? null : brandKit?.toneOfVoice ?? null,
          briefingOverrides: preparation.data.settings.briefingOverrides,
        })
      : null;

    // ---- fim da fase 1: reserva a tentativa e sai da transação ----
    // Tudo acima já rodou dentro do lock, como antes. A partir daqui a chamada
    // externa acontece FORA de qualquer transação, sob a tentativa reservada.
    const inputFingerprint = preparationInputFingerprint(snapshotBase);
    const claim = await claimPreparationAttempt({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      kind: "creative_prepare",
      inputRevision: aggregate.work.updatedAt.toISOString(),
      inputFingerprint,
      leaseSeconds: PREPARATION_LEASE_SECONDS,
    });
    if (claim.outcome === "joined") {
      // Uma preparação equivalente já está em curso: o consumidor acompanha
      // aquela em vez de disparar outra chamada ao provedor. É esta linha que
      // preserva a invariante medida na Task 8 — uma chamada, não duas.
      return {
        ok: false as const,
        error: {
          code: "preparation_in_progress" as const,
          details: { attemptId: claim.attempt.id },
        },
      };
    }
    if (claim.outcome === "revision_changed") {
      return { ok: false as const, error: { code: "stale_input" as const } };
    }
    return {
      phase: "continue" as const,
      aggregate,
      preparation,
      factPack,
      brandKit,
      brandAuthority,
      effectiveFormat,
      snapshotBase,
      effectiveBrief,
      briefing,
      attemptId: claim.attempt.id,
      inputFingerprint,
    };
  });
  // As saídas antecipadas da fase 1 são resultados do comando; o contexto para
  // as fases seguintes carrega `phase: "continue"`. Discriminar por esse literal
  // evita reescrever qualquer um dos retornos existentes e estreita de forma
  // inequívoca para o TypeScript.
  if (claimed.phase !== "continue") return claimed;

  const {
    aggregate,
    preparation,
    factPack,
    brandKit,
    brandAuthority,
    effectiveFormat,
    snapshotBase,
    attemptId,
    inputFingerprint,
  } = claimed;
  let effectiveBrief = claimed.effectiveBrief;
  let briefing = claimed.briefing;

  /** Fecha a tentativa e registra o descarte quando o resultado não vale mais. */
  const logDiscard = (reason: string) => {
    logCreativeWorkPreparationAttempt({
      ...preparationTelemetryBase(input),
      attemptId,
      kind: "creative_prepare",
      phase: "invalidated",
      lockWaitMs: 0,
      inTransactionMs: 0,
      externalMs: Date.now() - startedAt,
      totalMs: Date.now() - startedAt,
      reason,
    });
  };

  /** Fecha a tentativa como falha e registra o descarte. */
  const discard = async <T>(result: T, reason: string): Promise<T> => {
    const finalized = await finalizePreparationAttempt({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      attemptId,
      currentRevision: aggregate.work.updatedAt.toISOString(),
      currentFingerprint: inputFingerprint,
      state: "failed",
    });
    logDiscard(finalized.ok ? reason : finalized.reason);
    return result;
  };

    if (briefing) {
      let check = checkInferredBriefing(briefing, factPack);
      let automaticRevisionCount = 0;
      let reviewResult: "not_needed" | "passed" | "blocked" | "failed" = "not_needed";
      if (!check.ok) {
        automaticRevisionCount = 1;
        reviewResult = "failed";
        const revisedBrief = await reviewInferredBriefingOnce({
          briefing,
          factPack,
          findings: check.findings,
        });
        if (revisedBrief) {
          const revisedBriefing = buildInferredBriefing({
            request: aggregate.work.request,
            brief: revisedBrief,
            factPack,
            toneOfVoice: brandAuthority.kind === "source" ? null : brandKit?.toneOfVoice ?? null,
            briefingOverrides: preparation.data.settings.briefingOverrides,
          });
          check = checkInferredBriefing(revisedBriefing, factPack);
          if (check.ok) {
            briefing = revisedBriefing;
            effectiveBrief = revisedBrief;
            reviewResult = "passed";
          } else {
            reviewResult = "blocked";
          }
        }
      }
      logCreativeWorkBriefingCheck({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        generationCorrelationId: aggregate.work.generationCorrelationId,
        version: briefing.version,
        readiness: briefing.readiness,
        code: check.ok ? "ok" : "missing_direction",
        automaticRevisionCount,
        reviewResult,
      });
      if (!check.ok || briefing.readiness === "blocked") {
        return discard({
          ok: false as const,
          error: {
            code: "briefing_blocked" as const,
            details: {
              reason: "missing_direction" as const,
              readiness: briefing.readiness,
              confidence: briefing.confidence,
              briefing,
              factPack,
            },
          },
        }, "briefing_blocked");
      }
    }
    if (!effectiveBrief) {
      return discard({ ok: false as const, error: { code: "invalid_preparation" as const } }, "invalid_preparation");
    }
    // R-011: the env switch is a creation-time policy. Its current value is
    // frozen into the snapshot here; jobs later obey this frozen version and
    // never re-read the env, so rollback only affects newly prepared work.
    const snapshot: CreativeWorkInputSnapshot = {
      ...snapshotBase,
      ...(briefing ? { inferredBriefing: briefing } : {}),
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
      const preparedPlan = projectPreparedPlanV1(aggregate.work);
      if (!preparedPlan) return discard({ ok: false as const, error: { code: "invalid_preparation" as const } }, "invalid_preparation");
      // Nada a persistir: a preparação já valia. A tentativa fecha como
      // concluída para não bloquear o Trabalho até o lease vencer.
      const earlyFinalize = await finalizePreparationAttempt({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        attemptId,
        currentRevision: aggregate.work.updatedAt.toISOString(),
        currentFingerprint: inputFingerprint,
        state: "completed",
      });
      // Se uma edição entrou nesta janela, o briefing que estamos prestes a
      // devolver é velho. Devolvê-lo com ok:true seria mentir.
      if (!earlyFinalize.ok) {
        logDiscard(earlyFinalize.reason);
        return { ok: false as const, error: { code: "stale_input" as const } };
      }
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
            preparedPlan,
          },
        };
      }
      return { ok: true as const, value: { work: aggregate.work, quote, preparedPlan } };
    }
  // Renova o lease ENTRE as duas chamadas externas. A soma delas pode passar do
  // prazo, e uma tentativa auto-expirada faria o finalize recusar DEPOIS de a
  // chamada de copy já ter sido paga.
  if (!(await renewPreparationAttempt({
    workspaceId: input.workspaceId,
    attemptId,
    leaseSeconds: PREPARATION_LEASE_SECONDS,
  }))) {
    // A tentativa deixou de estar viva: uma edição venceu enquanto o briefing
    // era revisado. Descartar AGORA, antes de pagar a chamada de copy.
    logDiscard("attempt_lost_before_copy");
    return { ok: false as const, error: { code: "stale_input" as const } };
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
        brief: effectiveBrief,
        factPack,
        brandName: brandAuthority.kind === "source" ? brandAuthority.brandName : brandKit?.name ?? "Marca",
        toneOfVoice: brandAuthority.kind === "source" ? null : brandKit?.toneOfVoice ?? null,
        toneNotes: brandAuthority.kind === "source" ? null : brandKit?.toneNotes ?? null,
        description: brandAuthority.kind === "source" ? null : brandKit?.description ?? null,
        constraints: brandAuthority.kind === "source" ? null : brandKit?.constraints ?? null,
        requiredElements: brandAuthority.kind === "source" ? null : brandKit?.requiredElements ?? null,
        prohibitedElements: brandAuthority.kind === "source" ? null : brandKit?.prohibitedElements ?? null,
      });
    } catch (error) {
      if (error instanceof CreativeCopyContextError) {
        return discard({
          ok: false as const,
          error: { code: "invalid_context" as const, details: { violations: error.violations } },
        }, "invalid_context");
      }
      await discard(null, "provider_error");
      throw error;
    }
  // ---- fase 3: finalize curto ----
  // Relê a revisão AGORA. Se uma edição entrou enquanto o modelo respondia, o
  // resultado recém-chegado foi calculado sobre entradas que já não valem.
  const current = await getCreativeWork(input.workspaceId, input.workItemId);
  const finalized = await finalizePreparationAttempt({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    attemptId,
    currentRevision: current?.work.updatedAt.toISOString() ?? "",
    currentFingerprint: inputFingerprint,
    state: "completed",
  });
  if (!finalized.ok) {
    logDiscard(finalized.reason);
    return { ok: false as const, error: { code: "stale_input" as const } };
  }

    const work = await updateCreativeWorkDraftIfUnchanged(
      input.workspaceId,
      input.workItemId,
      aggregate.work.updatedAt,
      {
        brief: effectiveBrief,
        copy,
        title: deriveCreativeWorkTitle(effectiveBrief.theme),
        format: effectiveFormat,
        settings: preparation.data.settings,
        inputSnapshot: snapshot,
      },
    );
    if (!work) {
      logDiscard("stale_input");
      return { ok: false as const, error: { code: "stale_input" as const } };
    }
    const preparedPlan = projectPreparedPlanV1(work);
    if (!preparedPlan) return { ok: false as const, error: { code: "invalid_preparation" as const } };
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
            preparedPlan,
          },
        }
      : { ok: true as const, value: { work, quote, preparedPlan } };
}
