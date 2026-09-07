import { describe, expect, it } from "vitest";
import { limitAttachedImages, usageForAttachedFile, usageForDraftSource } from "./composer-attach";
import { captureDraftSnapshot, canFlushAutosaveForWork, shouldDeferDraftCreate } from "./composer-draft";
import { isComposerPlanStale, pendingAnalysisBlocksPrepare, restylePairMissing, shouldSkipPrepare } from "./composer-prepare";
import {
  draftStorageKey,
  reusableSourceForProtocol,
  projectComposerBusyState,
  projectComposerGenerateGate,
  projectVisibleComposerStage,
  projectVisiblePreparedPlan,
} from "./composer-state";
import {
  applySuggestedDirections,
  currentDirectionPool,
  shouldFetchDirectionSuggestions,
  toggleDirectionSelection,
  withManualDirectionInstruction,
} from "./composer-directions";
import {
  confirmGenerationDecision,
  generationLooksAccepted,
  runGuardedSubmit,
} from "./composer-submit";
import {
  firstProgressiveObjectiveUsage,
  nextProtocolDirectionPool,
  nextProtocolTargetFormats,
  protocolSwitchHasPendingWork,
  selectIntentDecision,
} from "./composer-protocol";
import { classifyLayerizeRequestFailure, revisionAttemptKey } from "./composer-outputs";
import {
  composerHasMeaningfulInput,
  isRevisingOutputBusy,
  nextPreparedPlanTracking,
  persistedBrandTrainingSuggestion,
  projectComposerBrandIdentity,
} from "./composer-view";
import {
  applyCanonicalWorkRevision,
  cachedCanonicalWorkRevision,
  EMPTY_COMPOSER_REVISION,
  markRevisionRefreshRequired,
  parseWorkRevision,
} from "./composer-revision";
import { hrefWithSearch, searchWithCampaignId, searchWithIntent, searchWithoutConsumedTemplate, searchWithWorkId } from "./composer-url";
import { composerHydrationAction } from "./composer-hydrate";
import {
  announcementDetailFromEvent,
  broadcastCreativeAnnouncement,
  clearStoredCreativeAnnouncement,
  CREATIVE_ANNOUNCEMENT_EVENT,
  readStoredCreativeAnnouncement,
} from "./composer-announce";

describe("composer attach and prepare", () => {
  it("keeps the first restyle file as original content", () => {
    expect(usageForAttachedFile({ intent: "restyle", hasRestyleContent: false })).toBe("content");
    expect(usageForAttachedFile({ intent: "restyle", hasRestyleContent: true })).toBe("style");
    expect(usageForDraftSource("restyle")).toBe("content");
    expect(usageForDraftSource("restyle", "style")).toBe("style");
    expect(usageForDraftSource("carousel")).toBe("style");
  });

  it("caps single-piece attachments at three and carousel at one live reference", () => {
    const files = [
      new File(["a"], "a.png", { type: "image/png" }),
      new File(["b"], "b.png", { type: "image/png" }),
      new File(["c"], "c.png", { type: "image/png" }),
      new File(["d"], "d.png", { type: "image/png" }),
    ];
    expect(limitAttachedImages({
      intent: "single",
      images: files,
      existingSourceCount: 1,
      existingNonFailedCount: 1,
    })).toEqual({ accepted: files.slice(0, 2), rejectedByLimit: 2 });
    expect(limitAttachedImages({
      intent: "carousel",
      images: files,
      existingSourceCount: 0,
      existingNonFailedCount: 0,
    }).accepted).toHaveLength(1);
    expect(limitAttachedImages({
      intent: "variations",
      images: files,
      existingSourceCount: 0,
      existingNonFailedCount: 0,
    }).rejectedByLimit).toBe(0);
  });

  it("does not skip prepare when a ready retry became stale", () => {
    expect(shouldSkipPrepare({ status: "ready", outputCount: 0, planIsStale: true })).toBe(false);
    expect(shouldSkipPrepare({ status: "generating", outputCount: 1, planIsStale: false })).toBe(true);
  });

  it("blocks prepare while a source is still analyzing", () => {
    expect(pendingAnalysisBlocksPrepare([{ status: "analyzing" }])).toBe(true);
    expect(pendingAnalysisBlocksPrepare([{ status: "ready" }])).toBe(false);
  });

  it("marks a prepared plan stale when the snapshot signature changed", () => {
    expect(isComposerPlanStale({
      currentPlanRevision: "rev-1",
      invalidatedPlanRevision: null,
      preparedSignature: "old",
      currentSignature: "new",
    })).toBe(true);
  });

  it("requires a restyle pair before prepare", () => {
    expect(restylePairMissing({
      intent: "restyle",
      request: "",
      sources: [{ id: "s1", usage: "content", status: "ready" }],
    })).toBe(true);
  });

  it("carries the original as content when switching into restyle", () => {
    const source = reusableSourceForProtocol("variations", "restyle", [{
      id: "s1",
      status: "ready",
      usageConfirmed: true,
      usage: "both",
      assetId: "asset-1",
      templateId: null,
    } as never]);
    expect(source).toMatchObject({ assetId: "asset-1", usage: "content" });
  });
});

describe("composer draft and submit decisions", () => {
  it("defers progressive draft creation until an objective exists", () => {
    expect(shouldDeferDraftCreate({ workflowVariant: "progressive", objective: null })).toBe(true);
    expect(shouldDeferDraftCreate({ workflowVariant: "progressive", objective: "single" })).toBe(false);
    expect(shouldDeferDraftCreate({ workflowVariant: "control", objective: null })).toBe(false);
  });

  it("allows flushing a ready retry with no outputs and blocks terminal work", () => {
    expect(canFlushAutosaveForWork({
      status: "ready",
      outputCount: 0,
      autosaveBlocked: false,
      revisionUnavailable: false,
    })).toBe(true);
    expect(canFlushAutosaveForWork({
      status: "generating",
      outputCount: 1,
      autosaveBlocked: false,
      revisionUnavailable: false,
    })).toBe(false);
  });

  it("captures a restyle snapshot without inventing single-piece typography settings", () => {
    const snapshot = captureDraftSnapshot({
      request: "Restyle desta peça",
      intent: "restyle",
      format: "4:5",
      targetFormats: [],
      formatMode: "auto",
      textLayout: "bottom",
      fontAssetKey: "font-1",
      directionPool: null,
    });
    expect(snapshot.settings.textLayout).toBeUndefined();
    expect(snapshot.settings.fontAssetKey).toBeUndefined();
    expect(snapshot.intent).toBe("restyle");
  });

  it("asks the operator to revise when the prepared signature is stale", () => {
    expect(confirmGenerationDecision({
      workId: "work-1",
      preparedRevision: "rev-1",
      preparedSignature: "stale:2",
      currentSignature: "new",
      status: "draft",
      outputCount: 0,
    })).toBe("revise");
    expect(confirmGenerationDecision({
      workId: "work-1",
      preparedRevision: "rev-1",
      preparedSignature: "same",
      currentSignature: "same",
      status: "draft",
      outputCount: 0,
    })).toBe("confirm");
    expect(confirmGenerationDecision({
      workId: "work-1",
      preparedRevision: "rev-1",
      preparedSignature: "same",
      currentSignature: "same",
      status: "generating",
      outputCount: 1,
    })).toBe("skip");
  });

  it("treats generating work or existing outputs as an accepted generation", () => {
    expect(generationLooksAccepted({ status: "generating", outputCount: 0, carouselSlideCount: 0 })).toBe(true);
    expect(generationLooksAccepted({ status: "draft", outputCount: 0, carouselSlideCount: 2 })).toBe(true);
    expect(generationLooksAccepted({ status: "draft", outputCount: 0, carouselSlideCount: 0 })).toBe(false);
  });

  it("runs submit once and clears the guard", async () => {
    const guard = { current: false };
    const result = await runGuardedSubmit(guard, false, async () => "ok");
    expect(result).toBe("ok");
    expect(guard.current).toBe(false);
    expect(await runGuardedSubmit(guard, true, async () => "nope")).toBeUndefined();
  });
});

describe("composer protocol and output decisions", () => {
  it("applies format and variation defaults without inventing a restyle pair", () => {
    expect(nextProtocolTargetFormats("format_adaptation")).toEqual(["1:1", "9:16"]);
    expect(nextProtocolTargetFormats("single")).toEqual([]);
    expect(nextProtocolDirectionPool("variations")?.selectedIds.length).toBeGreaterThan(0);
    expect(nextProtocolDirectionPool("carousel")).toBeNull();
    expect(firstProgressiveObjectiveUsage("restyle")).toBe("content");
    expect(firstProgressiveObjectiveUsage("carousel")).toBe("style");
    expect(firstProgressiveObjectiveUsage("single")).toBe("both");
  });

  it("defers a protocol switch while create, upload, or unsaved edits are in flight", () => {
    expect(protocolSwitchHasPendingWork({
      isUploading: false,
      actionPhase: "idle",
      sourceMutationPending: false,
      createMutationPending: false,
      createInFlight: false,
      hasUnsavedChanges: false,
    })).toBe(false);
    expect(protocolSwitchHasPendingWork({
      isUploading: false,
      actionPhase: "saving",
      sourceMutationPending: false,
      createMutationPending: false,
      createInFlight: false,
      hasUnsavedChanges: false,
    })).toBe(true);
  });

  it("keeps the first progressive objective separate from a later protocol switch", () => {
    expect(selectIntentDecision({
      workflowVariant: "progressive",
      hasObjective: false,
      next: "variations",
      current: "variations",
      hasPendingWork: true,
    })).toBe("first_progressive");
    expect(selectIntentDecision({
      workflowVariant: "progressive",
      hasObjective: true,
      next: "variations",
      current: "variations",
      hasPendingWork: true,
    })).toBe("noop");
    expect(selectIntentDecision({
      workflowVariant: "control",
      hasObjective: true,
      next: "restyle",
      current: "variations",
      hasPendingWork: true,
    })).toBe("defer");
    expect(selectIntentDecision({
      workflowVariant: "control",
      hasObjective: true,
      next: "restyle",
      current: "variations",
      hasPendingWork: false,
    })).toBe("switch");
  });

  it("refetches direction suggestions only for a variations draft without a live request", () => {
    expect(shouldFetchDirectionSuggestions({
      intent: "variations",
      workId: "work-1",
      hasReadySource: true,
      workStatus: "draft",
      retryToken: 0,
      hasPersistedAiSuggestions: false,
      alreadyRequestedForWorkId: null,
    })).toBe(true);
    expect(shouldFetchDirectionSuggestions({
      intent: "variations",
      workId: "work-1",
      hasReadySource: true,
      workStatus: "draft",
      retryToken: 0,
      hasPersistedAiSuggestions: true,
      alreadyRequestedForWorkId: null,
    })).toBe(false);
    expect(shouldFetchDirectionSuggestions({
      intent: "variations",
      workId: "work-1",
      hasReadySource: true,
      workStatus: "draft",
      retryToken: 1,
      hasPersistedAiSuggestions: true,
      alreadyRequestedForWorkId: null,
    })).toBe(true);
    expect(shouldFetchDirectionSuggestions({
      intent: "single",
      workId: "work-1",
      hasReadySource: true,
      workStatus: "draft",
      retryToken: 0,
      hasPersistedAiSuggestions: false,
      alreadyRequestedForWorkId: null,
    })).toBe(false);
  });

  it("classifies layerize dispatch loss as uncertain and keeps revision attempts stable", () => {
    expect(classifyLayerizeRequestFailure({ code: "creativeWorkLayerizationDispatchFailed" })).toBe("uncertain");
    expect(classifyLayerizeRequestFailure({ code: "creativeWorkLayerizationFailed" })).toBe("terminal");
    expect(revisionAttemptKey({
      outputId: "out-1",
      instruction: " mais contraste ",
      attachmentName: "ref.png",
      attachmentSize: 12,
    })).toBe("out-1:mais contraste:ref.png:12");
  });
});

describe("composer direction pool and busy state", () => {
  it("refuses to deselect the last variation direction", () => {
    const pool = currentDirectionPool(null);
    const onlyOne = { ...pool, selectedIds: [pool.directions[0]!.id] };
    expect(toggleDirectionSelection(onlyOne, pool.directions[0]!.id)).toBeNull();
  });

  it("keeps selected chips when merging new suggestions", () => {
    const pool = currentDirectionPool(null);
    const keptId = pool.directions[0]!.id;
    const current = { ...pool, selectedIds: [keptId], directions: [pool.directions[0]!] };
    const extra = {
      id: "00000000-0000-4000-8000-000000000099",
      label: "Nova",
      instruction: "Nova direção",
      order: 9,
      safetyBand: "safe" as const,
      provenance: "ai-suggestion" as const,
    };
    const next = applySuggestedDirections(current, [extra], true);
    expect(next?.selectedIds).toEqual([keptId]);
    expect(next?.directions.map((direction) => direction.id)).toEqual([keptId, extra.id]);
  });

  it("stores a blank manual instruction as null", () => {
    const pool = withManualDirectionInstruction(currentDirectionPool(null), "");
    expect(pool.manualInstruction).toBeNull();
  });

  it("projects generating ahead of ready input", () => {
    expect(projectComposerBusyState({
      generatePending: true,
      workStatus: "draft",
      hasOutputs: false,
      isUploading: false,
      createPending: false,
      autosavePending: false,
      sourceMutationPending: false,
      preparePending: false,
      analyzingSources: false,
      hasWorkId: true,
      hasRequest: true,
      hasSources: true,
    })).toBe("generating");
  });

  it("hides a stale prepared plan and keeps generate retryable on a ready work without outputs", () => {
    const stale = projectVisiblePreparedPlan({
      preparedPlan: { preparedRevision: "rev-1" },
      preparedInput: { revision: "rev-1", signature: "old" },
      planInputSignature: "new",
      invalidatedPlanRevision: null,
    });
    expect(stale.visiblePreparedPlan).toBeNull();
    expect(stale.planChangedSincePreparation).toBe(true);
    expect(projectVisibleComposerStage("plan", false)).toBe("configure");
    expect(projectComposerGenerateGate({
      clientProfileId: "p1",
      hasMeaningfulInput: true,
      workStatus: "ready",
      outputCount: 0,
      analyzingOrFailedSources: false,
      singlePieceReferenceBlocked: false,
      formatAdaptationNeedsFormats: false,
      singleNeedsFont: false,
      isUploading: false,
      actionPhase: "idle",
      generatePending: false,
      sourceMutationPending: false,
      briefingBusy: false,
      briefingBlocked: false,
      brandConflictPending: false,
    })).toBe(true);
  });
});

describe("extracted composer view projections", () => {
  it("does not treat a carousel request-less attach as meaningful input", () => {
    expect(composerHasMeaningfulInput({
      intent: "carousel",
      request: "   ",
      readySources: [{ id: "s1", usage: "style" }],
    })).toBe(false);
    expect(composerHasMeaningfulInput({
      intent: "carousel",
      request: "Deck de lançamento",
      readySources: [],
    })).toBe(true);
  });

  it("invalidates a prepared plan only after the operator edits the input it was built from", () => {
    expect(nextPreparedPlanTracking({
      preparedPlan: { preparedRevision: "rev-1", workId: "work-1" },
      hydratingRevision: null,
      previous: { revision: "rev-1", signature: "old" },
      planInputSignature: "new",
      invalidatedPlanRevision: null,
    })).toEqual({
      preparedInput: { revision: "rev-1", signature: "old" },
      hydratingRevision: null,
      invalidatedPlanRevision: "rev-1",
      emitPlanChanged: true,
    });
    expect(nextPreparedPlanTracking({
      preparedPlan: { preparedRevision: "rev-1", workId: "work-1" },
      hydratingRevision: "rev-1",
      previous: { revision: "rev-1", signature: "hydrated" },
      planInputSignature: "hydrated",
      invalidatedPlanRevision: null,
    }).hydratingRevision).toBeNull();
  });

  it("keeps a missing-visual-references hint off drafts and matches a later revision as busy", () => {
    expect(persistedBrandTrainingSuggestion({ status: "draft", assets: [] })).toBeNull();
    expect(persistedBrandTrainingSuggestion({ status: "ready", assets: [] })).toBe("missing_visual_references");
    expect(isRevisingOutputBusy({
      pending: true,
      variables: { outputId: "parent", instruction: "mais contraste", revisionAssetId: null },
      outputId: "child",
      outputs: [{
        id: "child",
        parentOutputId: "parent",
        revisionInstruction: "mais contraste",
        revisionAssetId: null,
      }],
    })).toBe(true);
  });

  it("freezes single-piece identity from the snapshot and does not invent it for restyle", () => {
    expect(projectComposerBrandIdentity({
      intent: "restyle",
      frozenKnowledge: { mode: "published", versionNumber: 3 },
      livePublished: true,
      liveVersionNumber: 3,
    })).toBeNull();
    expect(projectComposerBrandIdentity({
      intent: "single",
      frozenKnowledge: { mode: "published", versionNumber: 2 },
      snapshotAssets: [{ referenceId: "ref-1", label: "Logo", usageMode: "required" }],
      reasons: { "ref-1": ["lock"] },
      livePublished: false,
      liveVersionNumber: null,
    })).toEqual({
      source: "snapshot",
      mode: "published",
      versionNumber: 2,
      assets: [{ referenceId: "ref-1", label: "Logo", usageMode: "required", reasons: ["lock"] }],
    });
  });
});

describe("composer revision reconciliation", () => {
  it("parses a work updatedAt into a CAS token and ignores invalid dates", () => {
    expect(parseWorkRevision("2026-09-06T12:00:00.000Z")).toBe("2026-09-06T12:00:00.000Z");
    expect(parseWorkRevision("not-a-date")).toBeNull();
    expect(parseWorkRevision(null)).toBeNull();
  });

  it("applies a revision and clears a matching autosave block", () => {
    const applied = applyCanonicalWorkRevision({
      ...EMPTY_COMPOSER_REVISION,
      autosaveUnavailableWorkId: "work-1",
    }, "work-1", "2026-09-06T12:00:00.000Z");
    expect(applied.revision).toBe("2026-09-06T12:00:00.000Z");
    expect(applied.state.workRevisionWorkId).toBe("work-1");
    expect(applied.state.refreshRequiredWorkId).toBeNull();
    expect(applied.state.autosaveUnavailableWorkId).toBeNull();
  });

  it("returns the cached revision until a conflict marks refresh required", () => {
    const applied = applyCanonicalWorkRevision(EMPTY_COMPOSER_REVISION, "work-1", "2026-09-06T12:00:00.000Z");
    expect(cachedCanonicalWorkRevision(applied.state, "work-1")).toBe(applied.revision);
    const blocked = markRevisionRefreshRequired(applied.state, "work-1");
    expect(cachedCanonicalWorkRevision(blocked, "work-1")).toBeNull();
    expect(blocked.refreshRequiredWorkId).toBe("work-1");
  });
});

describe("composer url reload tokens", () => {
  it("keeps a valid workId on reload and rejects an invalid one", () => {
    expect(searchWithWorkId("?intent=single", "43f8a3ed-c8d1-4c0d-8bf7-04304738e6e9")).toContain("workId=43f8a3ed-c8d1-4c0d-8bf7-04304738e6e9");
    expect(searchWithWorkId("?intent=single", "not-a-uuid")).toBeNull();
  });

  it("drops workId when switching protocol and can clear a campaign link", () => {
    expect(searchWithIntent("?workId=43f8a3ed-c8d1-4c0d-8bf7-04304738e6e9", "restyle")).toBe("intent=restyle");
    expect(searchWithCampaignId("?campaignId=keep", null)).toBe("");
    expect(hrefWithSearch("/studio", "intent=single", "#dock")).toBe("/studio?intent=single#dock");
    expect(searchWithoutConsumedTemplate(
      "?templateId=43f8a3ed-c8d1-4c0d-8bf7-04304738e6e9&intent=single",
      "43f8a3ed-c8d1-4c0d-8bf7-04304738e6e9",
      null,
      "single",
    )).toBe("intent=single");
  });
});

describe("extracted composer journeys stay reversible", () => {
  it("revises after a delayed response whose prepared signature went stale", () => {
    expect(confirmGenerationDecision({
      workId: "work-1",
      preparedRevision: "rev-1",
      preparedSignature: "stale:old",
      currentSignature: "new",
      status: "draft",
      outputCount: 0,
    })).toBe("revise");
  });

  it("isolates stored drafts when the operator switches brand", () => {
    expect(draftStorageKey("brand-a", "single")).not.toBe(draftStorageKey("brand-b", "single"));
    expect(draftStorageKey("brand-a", "single")).not.toBe(draftStorageKey("brand-a", "restyle"));
  });

  it("keeps a failed layerize as a per-output terminal without blocking a later retry key", () => {
    expect(classifyLayerizeRequestFailure({ code: "creativeWorkLayerizationFailed" })).toBe("terminal");
    expect(revisionAttemptKey({
      outputId: "out-failed",
      instruction: "retry",
    })).not.toBe(revisionAttemptKey({
      outputId: "out-ok",
      instruction: "retry",
    }));
  });

  it("drops a cached revision after the work is marked obsolete", () => {
    const applied = applyCanonicalWorkRevision(EMPTY_COMPOSER_REVISION, "work-1", "2026-09-07T12:00:00.000Z");
    const stale = markRevisionRefreshRequired(applied.state, "work-1");
    expect(cachedCanonicalWorkRevision(stale, "work-1")).toBeNull();
    const recovered = applyCanonicalWorkRevision(stale, "work-1", "2026-09-07T12:01:00.000Z");
    expect(cachedCanonicalWorkRevision(recovered.state, "work-1")).toBe("2026-09-07T12:01:00.000Z");
  });

  it("reloads a draft in place and clears a stale restored non-draft", () => {
    expect(composerHydrationAction({
      hydratedId: "work-1",
      workId: "work-1",
      status: "draft",
      initialWorkId: "work-1",
    })).toBe("skip");
    expect(composerHydrationAction({
      hydratedId: null,
      workId: "work-2",
      status: "draft",
    })).toBe("hydrate");
    expect(composerHydrationAction({
      hydratedId: null,
      workId: "work-3",
      status: "ready",
    })).toBe("clear_stale_restore");
  });

  it("broadcasts an announcement that a remounted composer can consume", () => {
    clearStoredCreativeAnnouncement();
    broadcastCreativeAnnouncement("Rascunho salvo");
    expect(readStoredCreativeAnnouncement()).toBe("Rascunho salvo");
    expect(announcementDetailFromEvent(
      new CustomEvent(CREATIVE_ANNOUNCEMENT_EVENT, { detail: "Rascunho salvo" }),
    )).toBe("Rascunho salvo");
    clearStoredCreativeAnnouncement();
    expect(readStoredCreativeAnnouncement()).toBeNull();
  });
});
