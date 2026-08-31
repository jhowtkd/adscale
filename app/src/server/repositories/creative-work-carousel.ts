import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkCarouselSlides,
  creativeWorkItems,
  type CreativeWorkCarouselSlide,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkSource,
} from "../db/schema";
import {
  resolveCreativeWorkStatus,
  type CreativeWorkStatus,
} from "../creative-work/contracts";
import type {
  CarouselCopyAuthority,
  CarouselDeckPlanV1,
  CarouselLayoutFamily,
  CarouselNarrativeRole,
} from "../creative-work/carousel-contracts";
import { getCreativeWork } from "./creative-work";

type CarouselExecutor = Pick<typeof db, "select">;
type CarouselTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Slide writes serialize on one per-work lock: materialization and descendant
 * creation both read the current-version rows before writing, so a lost race
 * would otherwise produce two current versions for one position.
 */
const carouselLockScope = (workspaceId: string, workItemId: string) =>
  `${workspaceId}:${workItemId}:carousel`;

export async function listCurrentCarouselSlides(
  workspaceId: string,
  workItemId: string,
  executor: CarouselExecutor = db,
): Promise<CreativeWorkCarouselSlide[]> {
  return executor
    .select()
    .from(creativeWorkCarouselSlides)
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, workItemId),
        eq(creativeWorkCarouselSlides.isCurrent, true)
      )
    )
    .orderBy(asc(creativeWorkCarouselSlides.position));
}

export interface CreativeWorkCarouselAggregate {
  work: CreativeWorkItem;
  outputs: CreativeWorkOutput[];
  sources: CreativeWorkSource[];
  carouselSlides: CreativeWorkCarouselSlide[];
}

/**
 * Composes the existing creative work aggregate with its carousel slides.
 * `getCreativeWork()` itself is untouched: non-carousel works simply receive
 * `carouselSlides: []` so existing readers keep identical payloads.
 */
export async function getCreativeWorkCarouselAggregate(
  workspaceId: string,
  workItemId: string,
): Promise<CreativeWorkCarouselAggregate | null> {
  const aggregate = await getCreativeWork(workspaceId, workItemId);
  if (!aggregate) return null;
  const carouselSlides = aggregate.work.toolKind === "carousel"
    ? await listCurrentCarouselSlides(workspaceId, workItemId)
    : [];
  return { ...aggregate, carouselSlides };
}

/**
 * Inserts one draft slide per deck slide, idempotently: the frozen deck's
 * revision and slide ids are deterministic, and the
 * `(work_item_id, generation_operation_key)` unique index plus
 * `onConflictDoNothing` make replays no-ops. Returns the resulting current
 * slides ordered by position.
 */
export async function materializeCarouselSlides(input: {
  workspaceId: string;
  workItemId: string;
  deck: CarouselDeckPlanV1;
  visualContractHash: string;
}): Promise<CreativeWorkCarouselSlide[]> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${carouselLockScope(input.workspaceId, input.workItemId)}))`
    );
    await tx
      .insert(creativeWorkCarouselSlides)
      .values(
        input.deck.slides.map((slide) => ({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          lineageId: crypto.randomUUID(),
          parentSlideId: null,
          versionNumber: 1,
          deckRevision: input.deck.revision,
          position: slide.position,
          role: slide.role,
          primaryText: slide.primaryText,
          secondaryText: slide.secondaryText,
          copyAuthority: slide.authority,
          sourceFactIds: slide.sourceFactIds,
          layoutFamily: slide.layoutFamily,
          status: "draft" as const,
          visualContractHash: input.visualContractHash,
          generationOperationKey: `${input.deck.revision}:${slide.slideId}`,
          isCurrent: true,
        }))
      )
      .onConflictDoNothing();
    return listCurrentCarouselSlides(input.workspaceId, input.workItemId, tx);
  });
}

/** `draft|failed → queued`; any other state loses the CAS and returns null. */
export async function queueCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  anchorKey: string | null;
  operationKey: string;
}): Promise<CreativeWorkCarouselSlide | null> {
  const [row] = await db
    .update(creativeWorkCarouselSlides)
    .set({
      status: "queued",
      anchorKey: input.anchorKey,
      generationOperationKey: input.operationKey,
      errorCode: null,
      queuedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.id, input.slideId),
        inArray(creativeWorkCarouselSlides.status, ["draft", "failed"])
      )
    )
    .returning();
  return row ?? null;
}

/** `queued → processing`; a lost lease returns null. */
export async function markCarouselSlideProcessing(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
}): Promise<CreativeWorkCarouselSlide | null> {
  const [row] = await db
    .update(creativeWorkCarouselSlides)
    .set({ status: "processing", updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.id, input.slideId),
        eq(creativeWorkCarouselSlides.status, "queued")
      )
    )
    .returning();
  return row ?? null;
}

/** `processing → completed`; late completions after a lost lease return null. */
export async function completeCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  providerBaseKey: string;
  outputKey: string;
  previewKey: string | null;
  quality: Record<string, unknown>;
}): Promise<CreativeWorkCarouselSlide | null> {
  const [row] = await db
    .update(creativeWorkCarouselSlides)
    .set({
      status: "completed",
      providerBaseKey: input.providerBaseKey,
      outputKey: input.outputKey,
      previewKey: input.previewKey,
      quality: input.quality,
      errorCode: null,
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.id, input.slideId),
        eq(creativeWorkCarouselSlides.status, "processing")
      )
    )
    .returning();
  return row ?? null;
}

/** `processing → failed`; other states return null so retries requeue first. */
export async function failCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  errorCode: string;
}): Promise<CreativeWorkCarouselSlide | null> {
  const [row] = await db
    .update(creativeWorkCarouselSlides)
    .set({
      status: "failed",
      errorCode: input.errorCode,
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        eq(creativeWorkCarouselSlides.id, input.slideId),
        eq(creativeWorkCarouselSlides.status, "processing")
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Shares one already-uploaded anchor (brand snapshot reference) across the
 * slides that still miss it. Rows are matched only inside the workspace/work
 * scope and without an existing anchor, so an in-flight slide never gets its
 * anchor rewritten mid-generation.
 */
export async function setRemainingCarouselAnchorKey(input: {
  workspaceId: string;
  workItemId: string;
  slideIds: string[];
  anchorKey: string;
}): Promise<CreativeWorkCarouselSlide[]> {
  if (input.slideIds.length === 0) return [];
  const rows = await db
    .update(creativeWorkCarouselSlides)
    .set({ anchorKey: input.anchorKey, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
        inArray(creativeWorkCarouselSlides.id, input.slideIds),
        isNull(creativeWorkCarouselSlides.anchorKey)
      )
    )
    .returning();
  return rows.sort((left, right) => left.position - right.position);
}

/**
 * Starts a new version of one slide position: the parent flips to
 `isCurrent = false` and the child inserts as the single current row, in one
 transaction under the per-work lock. The parent row itself is preserved for
 its lineage and provider provenance.
 */
export async function createCarouselSlideDescendant(input: {
  workspaceId: string;
  workItemId: string;
  parentSlideId: string;
  deckRevision: string;
  position: number;
  role: CarouselNarrativeRole;
  primaryText: string;
  secondaryText: string | null;
  copyAuthority: CarouselCopyAuthority;
  sourceFactIds: string[];
  layoutFamily: CarouselLayoutFamily;
  visualContractHash: string;
  generationOperationKey: string;
  status: "draft" | "completed";
  providerBaseKey: string | null;
  outputKey: string | null;
  previewKey: string | null;
}): Promise<CreativeWorkCarouselSlide | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${carouselLockScope(input.workspaceId, input.workItemId)}))`
    );
    const [parent] = await tx
      .select()
      .from(creativeWorkCarouselSlides)
      .where(
        and(
          eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
          eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
          eq(creativeWorkCarouselSlides.id, input.parentSlideId),
          eq(creativeWorkCarouselSlides.isCurrent, true)
        )
      )
      .limit(1);
    if (!parent) return null;

    await tx
      .update(creativeWorkCarouselSlides)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(
        and(
          eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
          eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
          eq(creativeWorkCarouselSlides.id, input.parentSlideId),
          eq(creativeWorkCarouselSlides.isCurrent, true)
        )
      );

    const [child] = await tx
      .insert(creativeWorkCarouselSlides)
      .values({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        lineageId: parent.lineageId,
        parentSlideId: parent.id,
        versionNumber: parent.versionNumber + 1,
        deckRevision: input.deckRevision,
        position: input.position,
        role: input.role,
        primaryText: input.primaryText,
        secondaryText: input.secondaryText,
        copyAuthority: input.copyAuthority,
        sourceFactIds: input.sourceFactIds,
        layoutFamily: input.layoutFamily,
        status: input.status,
        providerBaseKey: input.providerBaseKey,
        outputKey: input.outputKey,
        previewKey: input.previewKey,
        visualContractHash: input.visualContractHash,
        generationOperationKey: input.generationOperationKey,
        isCurrent: true,
        ...(input.status === "completed"
          ? { queuedAt: new Date(), terminalAt: new Date() }
          : {}),
      })
      .returning();
    if (!child) throw new Error("carousel_slide_descendant_conflict_without_row");
    return child;
  });
}

/**
 * Recomputes the work status from the current carousel slides only and
 * persists it, mirroring refreshCreativeWorkStatus for the carousel flow.
 */
export async function refreshCarouselWorkStatus(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<CreativeWorkItem | null> {
  const [work] = await db
    .select()
    .from(creativeWorkItems)
    .where(
      and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId)
      )
    )
    .limit(1);
  if (!work) return null;

  const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId);
  const next: CreativeWorkStatus = slides.some(
    (slide) => slide.status === "queued" || slide.status === "processing"
  )
    ? "generating"
    : slides.length === 0
      ? "ready"
      : slides.every((slide) => slide.status === "completed")
        ? "completed"
        : slides.every((slide) => slide.status === "failed")
          ? "failed"
          : "partial";

  const [updated] = await db
    .update(creativeWorkItems)
    .set({ status: next, updatedAt: new Date() })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId)
      )
    )
    .returning();
  return updated ?? null;
}

export async function approveCarouselDeckRevision(input: {
  workspaceId: string;
  workItemId: string;
  deckRevision: string;
}): Promise<CreativeWorkItem | null> {
  const [row] = await db
    .update(creativeWorkItems)
    .set({
      carouselApprovedRevision: input.deckRevision,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(creativeWorkItems.workspaceId, input.workspaceId),
        eq(creativeWorkItems.id, input.workItemId)
      )
    )
    .returning();
  return row ?? null;
}
