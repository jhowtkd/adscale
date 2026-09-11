import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import {
  carouselLayoutFamilyForRole,
  resolveCarouselPreparedSnapshot,
  validateCarouselDeckStructure,
  validateTextFieldsAgainstFactPack,
  type CarouselDeckPlanV1,
  type CarouselLayoutFamily,
  type CarouselVisualContractV1,
} from "@/server/creative-work/carousel-contracts";
import { canonicalJsonStringify } from "@/server/creative-work/canonical-json";
import { withInvalidatedCarouselApprovals } from "@/server/creative-work/carousel-editorial-state";
import {
  runCarouselTextComposition,
  TextCompositionError,
} from "@/server/creative-work/text-composite";
import { approvedBrandFontAssets, type BrandFontAsset } from "@/server/brand-training/font-assets";
import type {
  CreativeWorkCarouselSlide,
  CreativeWorkItem,
} from "@/server/db/schema";
import { creativeWorkCarouselSlides, creativeWorkItems } from "@/server/db/schema";
import { db } from "@/server/db";
import { dispatchNextCarouselStage } from "@/server/application/advance-carousel-generation";
import { carouselSlideSettlementAdapter } from "@/server/generation/settlement-adapters";
import { startGenerationSettlement } from "@/server/generation/settlement";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  createCarouselSlideDescendant,
  listCurrentCarouselSlides,
  refreshCarouselWorkStatus,
} from "@/server/repositories/creative-work-carousel";
import { objectStorage } from "@/server/storage";

/**
 * Versioned carousel revisions (Task 7): copy-only edits recompose locally
 * from the frozen provider base with zero provider/credit calls, visual and
 * retry revisions create draft descendants that settle exactly one new
 * provider call through the one-slide settlement adapter, and deck revisions
 * reorder or redirect the whole deck without ever overwriting an older slide
 * version. New copy is validated against the frozen fact pack before any
 * descendant is written.
 */

const CAROUSEL_CANVAS: Record<"4:5" | "1:1", { width: number; height: number }> = {
  "4:5": { width: 1024, height: 1280 },
  "1:1": { width: 1024, height: 1024 },
};

export type ReviseCarouselSlideInput = {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  expectedVersion: number;
  revisionKey: string;
} & (
  | { kind: "copy"; primaryText: string; secondaryText: string | null }
  | { kind: "visual"; instruction: string }
  | { kind: "retry" }
);

export type ReviseCarouselSlideCommandInput = ReviseCarouselSlideInput & { userId: string };

export type ReviseCarouselDeckInput = {
  workspaceId: string;
  workItemId: string;
  expectedRevision: string;
  revisionKey: string;
  plan: CarouselDeckPlanV1;
  globalVisualInstruction: string | null;
};

export type ReviseCarouselDeckCommandInput = ReviseCarouselDeckInput & { userId: string };

export type ReviseCarouselSlideErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "stale_input"
  | "slide_not_found"
  | "slide_version_conflict"
  | "slide_not_completed"
  | "slide_not_failed"
  | "provider_base_missing"
  | "invalid_context"
  | "composition_failed"
  | "dispatch_failed";

export type ReviseCarouselSlideResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        slide: CreativeWorkCarouselSlide;
        slides: CreativeWorkCarouselSlide[];
        replay: boolean;
      };
    }
  | { ok: false; error: { code: ReviseCarouselSlideErrorCode; details?: unknown } };

export type ReviseCarouselDeckErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "stale_input"
  | "revision_conflict"
  | "invalid_plan"
  | "invalid_context"
  | "generation_in_flight"
  | "provider_base_missing"
  | "composition_failed"
  | "dispatch_failed";

export type ReviseCarouselDeckResult =
  | {
      ok: true;
      value: {
        work: CreativeWorkItem;
        slides: CreativeWorkCarouselSlide[];
        deckRevision: string;
        replay: boolean;
      };
    }
  | { ok: false; error: { code: ReviseCarouselDeckErrorCode; details?: unknown } };

type CarouselSnapshot = NonNullable<ReturnType<typeof resolveCarouselPreparedSnapshot>>;

async function loadCarouselWork(
  workspaceId: string,
  workItemId: string,
): Promise<
  | { ok: true; work: CreativeWorkItem; snapshot: CarouselSnapshot }
  | { ok: false; code: "work_not_found" | "work_not_carousel" | "stale_input" }
> {
  const aggregate = await getCreativeWork(workspaceId, workItemId);
  if (!aggregate) return { ok: false, code: "work_not_found" };
  const { work } = aggregate;
  if (work.toolKind !== "carousel") return { ok: false, code: "work_not_carousel" };
  const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
  if (!snapshot) return { ok: false, code: "stale_input" };
  return { ok: true, work, snapshot };
}

/**
 * Deterministic local recomposition from the frozen text-free provider base —
 * the exact composition path the slide job runs after its single provider
 * call: frozen exact-asset slots first, approved font or Pango `sans`
 * fallback, then the shared text composition. No image provider is involved.
 */
async function composeCarouselSlideFromProviderBase(input: {
  providerBaseKey: string;
  contract: CarouselVisualContractV1;
  deckFormat: "4:5" | "1:1";
  identitySnapshot: CreativeWorkItem["identitySnapshot"];
  layoutFamily: CarouselLayoutFamily;
  primaryText: string;
  secondaryText: string | null;
}): Promise<Buffer> {
  const baseBuffer = await objectStorage.get(input.providerBaseKey);
  const layoutPlan = input.contract.layoutFamilies[input.layoutFamily];
  const dimensions = CAROUSEL_CANVAS[input.deckFormat];

  let composedBase = baseBuffer;
  if (layoutPlan.exactAssetSlots.length > 0) {
    const layers = await Promise.all(
      layoutPlan.exactAssetSlots.map(async (slot) => {
        const assetBuffer = await objectStorage.get(slot.assetKey).catch(() => null);
        if (!assetBuffer) {
          throw new Error(`exact asset not found: ${slot.assetKey}`);
        }
        const resized = await sharp(assetBuffer)
          .resize(slot.width, slot.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer();
        return { input: resized, left: slot.x, top: slot.y };
      }),
    );
    composedBase = await sharp(baseBuffer)
      .resize(dimensions.width, dimensions.height, { fit: "cover" })
      .composite(layers)
      .png()
      .toBuffer();
  }

  let font: BrandFontAsset | null = null;
  let fontBuffer: Buffer | null = null;
  let fallbackFamily: "sans" | null = null;
  if (input.contract.typography.authority === "approved" && input.contract.typography.fontAssetKey) {
    const approved = approvedBrandFontAssets(input.identitySnapshot?.brandKit.fontAssets ?? []);
    const selected = approved.find((asset) => asset.assetKey === input.contract.typography.fontAssetKey);
    if (selected) {
      font = selected;
      fontBuffer = await objectStorage.get(selected.assetKey).catch(() => null);
      if (!fontBuffer) {
        throw new Error(`approved font asset not found: ${selected.assetKey}`);
      }
    } else {
      fallbackFamily = "sans";
    }
  } else {
    fallbackFamily = input.contract.typography.fallbackFamily ?? "sans";
  }

  const composition = await runCarouselTextComposition({
    base: composedBase,
    dimensions,
    primaryText: input.primaryText,
    secondaryText: input.secondaryText,
    primaryRegion: layoutPlan.primaryRegion,
    secondaryRegion: layoutPlan.secondaryRegion,
    safeAreaPx: input.contract.safeAreaPx,
    font,
    fontBuffer,
    fallbackFamily,
    brandColors: input.identitySnapshot?.brandKit.colors ?? [],
  });
  return composition.buffer;
}

function textViolationDetails(error: unknown): { code: "composition_failed"; details: unknown } {
  return {
    code: "composition_failed",
    details: { reason: error instanceof TextCompositionError ? error.code : String(error) },
  };
}

const PUBLIC_SLIDE_OMIT = [
  "providerBaseKey",
  "previewKey",
  "anchorKey",
  "generationOperationKey",
  "outputKey",
] as const;

type PublicCarouselSlide = Omit<
  CreativeWorkCarouselSlide,
  (typeof PUBLIC_SLIDE_OMIT)[number]
> & { hasOutput: boolean };

function settingsAfterMaterialCarouselEdit(work: CreativeWorkItem) {
  if (!work.settings?.carouselEditorial) return {};
  return { settings: withInvalidatedCarouselApprovals(work.settings) };
}

/** Same projection the work GET route uses: no storage or settlement keys. */
export function toPublicCarouselSlide(slide: CreativeWorkCarouselSlide): PublicCarouselSlide {
  const publicSlide: Record<string, unknown> = { ...slide };
  for (const key of PUBLIC_SLIDE_OMIT) {
    delete publicSlide[key];
  }
  return { ...publicSlide, hasOutput: Boolean(slide.outputKey) } as PublicCarouselSlide;
}

export async function reviseCarouselSlide(
  input: ReviseCarouselSlideCommandInput,
): Promise<ReviseCarouselSlideResult> {
  const loaded = await loadCarouselWork(input.workspaceId, input.workItemId);
  if (!loaded.ok) return { ok: false, error: { code: loaded.code } };
  const { work, snapshot } = loaded;

  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  const slide = slides.find((row) => row.id === input.slideId);
  if (!slide) {
    return { ok: false, error: { code: "slide_not_found" } };
  }

  // Idempotency first: the same revisionKey always returns the same descendant.
  const [replayed] = await db
    .select()
    .from(creativeWorkCarouselSlides)
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.generationOperationKey, input.revisionKey),
      ),
    )
    .limit(1);
  if (replayed) {
    return {
      ok: true,
      value: { work, slide: replayed, slides, replay: true },
    };
  }

  if (slide.versionNumber !== input.expectedVersion) {
    return {
      ok: false,
      error: {
        code: "slide_version_conflict",
        details: { expectedVersion: input.expectedVersion, currentVersion: slide.versionNumber },
      },
    };
  }

  if (input.kind === "retry" && slide.status !== "failed") {
    return { ok: false, error: { code: "slide_not_failed", details: { status: slide.status } } };
  }
  if (input.kind !== "retry" && slide.status !== "completed") {
    return { ok: false, error: { code: "slide_not_completed", details: { status: slide.status } } };
  }

  if (input.kind === "copy") {
    const factPack = work.inputSnapshot?.factPack ?? null;
    if (!factPack) return { ok: false, error: { code: "stale_input" } };
    // Ground the new copy before any descendant or artifact is written.
    const violations = validateTextFieldsAgainstFactPack(
      [
        { field: `slides.${slide.position}.primaryText`, text: input.primaryText },
        ...(input.secondaryText
          ? [{ field: `slides.${slide.position}.secondaryText`, text: input.secondaryText }]
          : []),
      ],
      factPack,
    );
    if (violations.length > 0) {
      return { ok: false, error: { code: "invalid_context", details: { violations } } };
    }
    if (!slide.providerBaseKey) {
      return { ok: false, error: { code: "provider_base_missing", details: { slideId: slide.id } } };
    }

    let finalBuffer: Buffer;
    try {
      finalBuffer = await composeCarouselSlideFromProviderBase({
        providerBaseKey: slide.providerBaseKey,
        contract: snapshot.visualContract,
        deckFormat: snapshot.deck.format,
        identitySnapshot: work.identitySnapshot,
        layoutFamily: slide.layoutFamily,
        primaryText: input.primaryText,
        secondaryText: input.secondaryText,
      });
    } catch (error) {
      if (error instanceof TextCompositionError) {
        return { ok: false, error: textViolationDetails(error) };
      }
      throw error;
    }

    const outputKey = `creative-work/${input.workItemId}/carousel/revise/${input.revisionKey}/final.png`;
    await objectStorage.put(outputKey, finalBuffer, "image/png");

    const child = await createCarouselSlideDescendant({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      parentSlideId: slide.id,
      deckRevision: snapshot.deck.revision,
      position: slide.position,
      role: slide.role,
      primaryText: input.primaryText,
      secondaryText: input.secondaryText,
      copyAuthority: "human_edit",
      sourceFactIds: slide.sourceFactIds,
      layoutFamily: slide.layoutFamily,
      visualContractHash: snapshot.visualContract.contractHash,
      generationOperationKey: input.revisionKey,
      status: "completed",
      providerBaseKey: slide.providerBaseKey,
      outputKey,
      previewKey: outputKey,
    });
    if (!child) {
      return {
        ok: false,
        error: { code: "slide_version_conflict", details: { reason: "parent_no_longer_current" } },
      };
    }
    const editorialSettings = settingsAfterMaterialCarouselEdit(work);
    if (editorialSettings.settings) {
      await db
        .update(creativeWorkItems)
        .set({
          ...editorialSettings,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(creativeWorkItems.workspaceId, input.workspaceId),
            eq(creativeWorkItems.id, input.workItemId),
          ),
        );
    }
    const refreshed = await refreshCarouselWorkStatus({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
    }).catch(() => null);
    const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
    return {
      ok: true,
      value: { work: refreshed ?? work, slide: child, slides: current, replay: false },
    };
  }

  // visual | retry: one draft descendant, same contract and anchor, then the
  // normal job flow generates it through its own one-slide settlement.
  const child = await createCarouselSlideDescendant({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    parentSlideId: slide.id,
    deckRevision: snapshot.deck.revision,
    position: slide.position,
    role: slide.role,
    primaryText: slide.primaryText,
    secondaryText: slide.secondaryText,
    copyAuthority: slide.copyAuthority,
    sourceFactIds: slide.sourceFactIds,
    layoutFamily: slide.layoutFamily,
    visualContractHash: snapshot.visualContract.contractHash,
    generationOperationKey: input.revisionKey,
    status: "draft",
    providerBaseKey: null,
    outputKey: null,
    previewKey: null,
  });
  if (!child) {
    return {
      ok: false,
      error: { code: "slide_version_conflict", details: { reason: "parent_no_longer_current" } },
    };
  }
  if (input.kind === "visual") {
    const editorialSettings = settingsAfterMaterialCarouselEdit(work);
    if (editorialSettings.settings) {
      await db
        .update(creativeWorkItems)
        .set({
          ...editorialSettings,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(creativeWorkItems.workspaceId, input.workspaceId),
            eq(creativeWorkItems.id, input.workItemId),
          ),
        );
    }
  }
  const settled = await startGenerationSettlement(
    carouselSlideSettlementAdapter({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      slideId: child.id,
      userId: input.userId,
      anchorKey: slide.anchorKey ?? null,
      operationKey: input.revisionKey,
    }),
  );
  if (!settled.ok) {
    return { ok: false, error: { code: "dispatch_failed", details: settled.error } };
  }
  const refreshed = await refreshCarouselWorkStatus({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
  }).catch(() => null);
  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  return {
    ok: true,
    value: { work: refreshed ?? work, slide: child, slides: current, replay: false },
  };
}

function slideChanges(input: {
  planSlide: CarouselDeckPlanV1["slides"][number];
  row: CreativeWorkCarouselSlide;
}): boolean {
  return (
    input.planSlide.position !== input.row.position ||
    input.planSlide.role !== input.row.role ||
    carouselLayoutFamilyForRole(input.planSlide.role) !== input.row.layoutFamily ||
    input.planSlide.primaryText !== input.row.primaryText ||
    (input.planSlide.secondaryText ?? null) !== input.row.secondaryText
  );
}

export async function reviseCarouselDeck(
  input: ReviseCarouselDeckCommandInput,
): Promise<ReviseCarouselDeckResult> {
  const loaded = await loadCarouselWork(input.workspaceId, input.workItemId);
  if (!loaded.ok) return { ok: false, error: { code: loaded.code } };
  const { work, snapshot } = loaded;

  const deckRevision = `deck-${input.revisionKey}`;

  // Idempotency first: a replayed revisionKey returns the same current slides.
  const [replayed] = await db
    .select()
    .from(creativeWorkCarouselSlides)
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.deckRevision, deckRevision),
      ),
    )
    .limit(1);
  if (replayed) {
    const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
    if (current.some((slide) => slide.status === "draft")) {
      // The chain restart is idempotent: only missing anchors settle again.
      await dispatchNextCarouselStage({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        userId: input.userId,
      }).catch(() => undefined);
    }
    return {
      ok: true,
      value: { work, slides: current, deckRevision, replay: true },
    };
  }

  if (snapshot.deck.revision !== input.expectedRevision) {
    return {
      ok: false,
      error: {
        code: "revision_conflict",
        details: { expectedRevision: input.expectedRevision, current: snapshot.deck.revision },
      },
    };
  }

  if (input.plan.workId !== input.workItemId) {
    return {
      ok: false,
      error: { code: "invalid_plan", details: { reason: "carousel_deck_work_id_mismatch" } },
    };
  }
  if (input.plan.format !== snapshot.deck.format) {
    return {
      ok: false,
      error: { code: "invalid_plan", details: { reason: "carousel_deck_format_is_frozen" } },
    };
  }
  const structuralFindings = validateCarouselDeckStructure(input.plan);
  if (structuralFindings.length > 0) {
    return { ok: false, error: { code: "invalid_plan", details: { findings: structuralFindings } } };
  }

  const oldBySlideId = new Map(snapshot.deck.slides.map((slide) => [slide.slideId, slide]));
  if (
    input.plan.slides.length !== snapshot.deck.slides.length ||
    input.plan.slides.some((slide) => !oldBySlideId.has(slide.slideId))
  ) {
    return {
      ok: false,
      error: {
        code: "invalid_plan",
        details: { reason: "carousel_deck_slide_ids_must_be_stable" },
      },
    };
  }

  // Ground every plan copy claim against the frozen fact pack BEFORE writing
  // any descendant.
  const factPack = work.inputSnapshot?.factPack ?? null;
  if (!factPack) return { ok: false, error: { code: "stale_input" } };
  const violations = validateTextFieldsAgainstFactPack(
    input.plan.slides.flatMap((slide, index) => [
      { field: `slides.${index}.primaryText`, text: slide.primaryText },
      ...(slide.secondaryText
        ? [{ field: `slides.${index}.secondaryText`, text: slide.secondaryText }]
        : []),
    ]),
    factPack,
  );
  if (violations.length > 0) {
    return { ok: false, error: { code: "invalid_context", details: { violations } } };
  }

  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  if (slides.some((slide) => slide.status === "queued" || slide.status === "processing")) {
    return { ok: false, error: { code: "generation_in_flight" } };
  }
  // Rows map to lineages through the frozen plan's positions: exactly one
  // current row per position.
  const rowBySlideId = new Map<string, CreativeWorkCarouselSlide>();
  for (const planSlide of input.plan.slides) {
    const oldSlide = oldBySlideId.get(planSlide.slideId);
    if (!oldSlide) continue;
    const row = slides.find((candidate) => candidate.position === oldSlide.position);
    if (!row) return { ok: false, error: { code: "stale_input" } };
    rowBySlideId.set(planSlide.slideId, row);
  }

  const trimmedDirection = input.globalVisualInstruction?.trim() ?? null;

  if (trimmedDirection) {
    // Global direction: copy the prior contract, set the trimmed instruction,
    // recompute the hash over the complete contract without its own hash, and
    // clear deck approval and quality so the deck must be re-reviewed.
    const withoutHash = { ...snapshot.visualContract };
    delete (withoutHash as { contractHash?: string }).contractHash;
    // The hash covers the complete new contract — new instruction included —
    // minus its own hash, matching buildCarouselVisualContract().
    const contractWithoutHash: Omit<CarouselVisualContractV1, "contractHash"> = {
      ...withoutHash,
      directionInstruction: trimmedDirection,
    };
    const newContract: CarouselVisualContractV1 = {
      ...contractWithoutHash,
      contractHash: createHash("sha256")
        .update(canonicalJsonStringify(contractWithoutHash))
        .digest("hex"),
    };
    const currentSnapshot = work.inputSnapshot;
    if (!currentSnapshot) return { ok: false, error: { code: "stale_input" } };
    await db
      .update(creativeWorkItems)
      .set({
        inputSnapshot: {
          ...currentSnapshot,
          carousel: {
            version: 1 as const,
            preparedRevision: snapshot.preparedRevision,
            deck: { ...input.plan, revision: deckRevision },
            visualContract: newContract,
          },
        },
        carouselApprovedRevision: null,
        carouselQuality: null,
        ...settingsAfterMaterialCarouselEdit(work),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(creativeWorkItems.workspaceId, input.workspaceId),
          eq(creativeWorkItems.id, input.workItemId),
        ),
      );

    // Descendants every position: every slide is regenerated under the new
    // direction while its lineage and prior versions are preserved.
    for (const planSlide of input.plan.slides) {
      const row = rowBySlideId.get(planSlide.slideId);
      if (!row) return { ok: false, error: { code: "stale_input" } };
      const child = await createCarouselSlideDescendant({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        parentSlideId: row.id,
        deckRevision,
        position: planSlide.position,
        role: planSlide.role,
        primaryText: planSlide.primaryText,
        secondaryText: planSlide.secondaryText,
        copyAuthority: planSlide.primaryText === row.primaryText && (planSlide.secondaryText ?? null) === row.secondaryText
          ? row.copyAuthority
          : "human_edit",
        sourceFactIds: planSlide.sourceFactIds,
        layoutFamily: carouselLayoutFamilyForRole(planSlide.role),
        visualContractHash: newContract.contractHash,
        generationOperationKey: `${input.revisionKey}::${row.id}`,
        status: "draft",
        providerBaseKey: null,
        outputKey: null,
        previewKey: null,
      });
      if (!child) return { ok: false, error: { code: "stale_input" } };
    }

    // Restart the chain: only the new anchor trio is dispatched first; the
    // job completions drive cover → middle → closing → remaining.
    const dispatched = await dispatchNextCarouselStage({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      userId: input.userId,
    });
    if (!dispatched.ok) {
      return { ok: false, error: { code: "dispatch_failed", details: dispatched.error } };
    }
    const refreshed = await refreshCarouselWorkStatus({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
    }).catch(() => null);
    const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
    return {
      ok: true,
      value: { work: refreshed ?? work, slides: current, deckRevision, replay: false },
    };
  }

  // Reorder/edit revision: the frozen contract, approval and quality stay.
  for (const planSlide of input.plan.slides) {
    const row = rowBySlideId.get(planSlide.slideId);
    if (!row || !slideChanges({ planSlide, row })) continue;

    const layoutFamily = carouselLayoutFamilyForRole(planSlide.role);
    const copyChanged =
      planSlide.primaryText !== row.primaryText ||
      (planSlide.secondaryText ?? null) !== row.secondaryText;
    const familyChanged = layoutFamily !== row.layoutFamily;

    if (row.status === "completed") {
      let outputKey = row.outputKey;
      let previewKey = row.previewKey;
      if ((copyChanged || familyChanged) && row.providerBaseKey) {
        try {
          const finalBuffer = await composeCarouselSlideFromProviderBase({
            providerBaseKey: row.providerBaseKey,
            contract: snapshot.visualContract,
            deckFormat: snapshot.deck.format,
            identitySnapshot: work.identitySnapshot,
            layoutFamily,
            primaryText: planSlide.primaryText,
            secondaryText: planSlide.secondaryText,
          });
          outputKey = `creative-work/${input.workItemId}/carousel/revise/${input.revisionKey}/${row.lineageId}/final.png`;
          previewKey = outputKey;
          await objectStorage.put(outputKey, finalBuffer, "image/png");
        } catch (error) {
          if (error instanceof TextCompositionError) {
            return { ok: false, error: textViolationDetails(error) };
          }
          throw error;
        }
      }
      if ((copyChanged || familyChanged) && !row.providerBaseKey) {
        return {
          ok: false,
          error: { code: "provider_base_missing", details: { slideId: row.id } },
        };
      }
      const child = await createCarouselSlideDescendant({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        parentSlideId: row.id,
        deckRevision,
        position: planSlide.position,
        role: planSlide.role,
        primaryText: planSlide.primaryText,
        secondaryText: planSlide.secondaryText,
        copyAuthority: copyChanged ? "human_edit" : row.copyAuthority,
        sourceFactIds: planSlide.sourceFactIds,
        layoutFamily,
        visualContractHash: snapshot.visualContract.contractHash,
        generationOperationKey: `${input.revisionKey}::${row.id}`,
        status: "completed",
        providerBaseKey: row.providerBaseKey,
        outputKey,
        previewKey,
      });
      if (!child) return { ok: false, error: { code: "stale_input" } };
      continue;
    }

    // Undispatched draft: replace its pending plan values with a new draft.
    const child = await createCarouselSlideDescendant({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      parentSlideId: row.id,
      deckRevision,
      position: planSlide.position,
      role: planSlide.role,
      primaryText: planSlide.primaryText,
      secondaryText: planSlide.secondaryText,
      copyAuthority: copyChanged ? "human_edit" : row.copyAuthority,
      sourceFactIds: planSlide.sourceFactIds,
      layoutFamily,
      visualContractHash: snapshot.visualContract.contractHash,
      generationOperationKey: `${input.revisionKey}::${row.id}`,
      status: "draft",
      providerBaseKey: null,
      outputKey: null,
      previewKey: null,
    });
    if (!child) return { ok: false, error: { code: "stale_input" } };
  }

  const currentSnapshot = work.inputSnapshot;
  if (!currentSnapshot) return { ok: false, error: { code: "stale_input" } };
  await db
    .update(creativeWorkItems)
    .set({
      inputSnapshot: {
        ...currentSnapshot,
        carousel: {
          version: 1 as const,
          preparedRevision: snapshot.preparedRevision,
          deck: { ...input.plan, revision: deckRevision },
          visualContract: snapshot.visualContract,
        },
      },
      ...settingsAfterMaterialCarouselEdit(work),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId),
      ),
    );

  const refreshed = await refreshCarouselWorkStatus({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
  }).catch(() => null);
  const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  return {
    ok: true,
    value: { work: refreshed ?? work, slides: current, deckRevision, replay: false },
  };
}
