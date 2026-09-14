import { artRefinementParentHash } from "@/server/creative-work/art-refinement-parent-hash";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  creativeWorkCarouselSlides,
  creativeWorkItems,
  creativeWorkRefinementAttempts,
  type CreativeWorkCarouselSlide,
  type CreativeWorkItem,
  type CreativeWorkOutput,
  type CreativeWorkSource,
} from "../db/schema";
import {
  ART_REFINEMENT_MAX_REVISIONS_PER_ROOT,
  artRefinementRevisionKey,
  carouselRevisionUnits,
} from "../creative-work/art-refinement";
import type { ArtRefinementClaimResult } from "./creative-work";
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
import { resolveCarouselPreparedSnapshot } from "../creative-work/carousel-contracts";
import {
  authorizeCarouselSlideClaim,
  hasCurrentApprovedCarouselCover,
  readCarouselEditorial,
  writeCarouselEditorial,
} from "../creative-work/carousel-editorial-state";
import { getCreativeWork, updateCreativeWorkIfUnchanged } from "./creative-work";

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

export type QueueAuthorizedCarouselSlideResult =
  | { outcome: "claimed"; slide: CreativeWorkCarouselSlide }
  | { outcome: "already_claimed"; slide: CreativeWorkCarouselSlide }
  | { outcome: "unauthorized" }
  | { outcome: "missing" };

/**
 * Queue CAS bound to the current editorial revision: the cover/interiors
 * authorization is observed in the same transaction as the draft|failed →
 * queued claim so a distant pre-check cannot win the race.
 */
export async function queueAuthorizedCarouselSlide(input: {
  workspaceId: string;
  workItemId: string;
  slideId: string;
  anchorKey: string | null;
  operationKey: string;
}): Promise<QueueAuthorizedCarouselSlideResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${carouselLockScope(input.workspaceId, input.workItemId)}))`,
    );
    const [work] = await tx
      .select()
      .from(creativeWorkItems)
      .where(
        and(
          eq(creativeWorkItems.workspaceId, input.workspaceId),
          eq(creativeWorkItems.id, input.workItemId),
        ),
      )
      .limit(1);
    const [slide] = await tx
      .select()
      .from(creativeWorkCarouselSlides)
      .where(
        and(
          eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
          eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
          eq(creativeWorkCarouselSlides.id, input.slideId),
        ),
      )
      .limit(1);
    if (!work || !slide) return { outcome: "missing" as const };
    const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
    const editorial = readCarouselEditorial(work.settings);
    const current = await listCurrentCarouselSlides(input.workspaceId, input.workItemId, tx);
    const coverSlideId = editorial?.approvedCover?.slideId
      ?? current.find((row) => row.position === 1)?.id
      ?? null;
    if (!snapshot || !authorizeCarouselSlideClaim({
      editorial,
      generationScope: snapshot.generationScope,
      scriptRevision: snapshot.scriptRevision,
      preparedRevision: snapshot.preparedRevision,
      slidePosition: slide.position,
      coverSlideId,
    })) {
      return { outcome: "unauthorized" as const };
    }
    if (slide.status !== "draft" && slide.status !== "failed") {
      return { outcome: "already_claimed" as const, slide };
    }
    const [queued] = await tx
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
          inArray(creativeWorkCarouselSlides.status, ["draft", "failed"]),
        ),
      )
      .returning();
    if (queued) return { outcome: "claimed" as const, slide: queued };
    const [latest] = await tx
      .select()
      .from(creativeWorkCarouselSlides)
      .where(
        and(
          eq(creativeWorkCarouselSlides.workspaceId, input.workspaceId),
          eq(creativeWorkCarouselSlides.workItemId, input.workItemId),
          eq(creativeWorkCarouselSlides.id, input.slideId),
        ),
      )
      .limit(1);
    if (latest && latest.status !== "draft" && latest.status !== "failed") {
      return { outcome: "already_claimed" as const, slide: latest };
    }
    return { outcome: "unauthorized" as const };
  });
}

/**
 * Persist lote confirmation under the same CAS sanitizer as other approvals.
 * The write observes the current script/cover revision in-transaction so a
 * stale read cannot confirm interiors after invalidation.
 */
export async function confirmCarouselInteriorsRevision(input: {
  workspaceId: string;
  workItemId: string;
  expectedUpdatedAt: Date;
  preparedRevision: string;
  scriptRevision: string;
  coverSlideId: string;
}): Promise<CreativeWorkItem | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${carouselLockScope(input.workspaceId, input.workItemId)}))`,
    );
    const [work] = await tx
      .select()
      .from(creativeWorkItems)
      .where(
        and(
          eq(creativeWorkItems.workspaceId, input.workspaceId),
          eq(creativeWorkItems.id, input.workItemId),
        ),
      )
      .limit(1);
    if (!work) return null;
    const editorial = readCarouselEditorial(work.settings);
    if (!editorial) return null;
    if (
      editorial.confirmedInteriorsRevision === input.preparedRevision
      && hasCurrentApprovedCarouselCover(
        editorial,
        input.scriptRevision,
        input.preparedRevision,
        input.coverSlideId,
      )
    ) {
      return work;
    }
    if (!hasCurrentApprovedCarouselCover(
      editorial,
      input.scriptRevision,
      input.preparedRevision,
      input.coverSlideId,
    )) {
      return null;
    }
    const nextSettings = writeCarouselEditorial(work.settings, {
      ...editorial,
      confirmedInteriorsRevision: input.preparedRevision,
    });
    return updateCreativeWorkIfUnchanged(
      input.workspaceId,
      input.workItemId,
      input.expectedUpdatedAt,
      { settings: nextSettings },
      tx,
      { persistCarouselApprovals: true },
    );
  });
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
/**
 * Every version of one slide lineage — current and superseded — oldest
 * first. The refinement coordinator walks this to resolve the stable root
 * (version 1) and to compare the completed versions of a lineage.
 */
export async function listCarouselSlideLineage(
  workspaceId: string,
  workItemId: string,
  lineageId: string,
  executor: CarouselExecutor = db,
): Promise<CreativeWorkCarouselSlide[]> {
  return executor
    .select()
    .from(creativeWorkCarouselSlides)
    .where(
      and(
        eq(creativeWorkCarouselSlides.workspaceId, workspaceId),
        eq(creativeWorkCarouselSlides.workItemId, workItemId),
        eq(creativeWorkCarouselSlides.lineageId, lineageId)
      )
    )
    .orderBy(asc(creativeWorkCarouselSlides.versionNumber));
}

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
  /**
   * Draft payload only (e.g. a pending visual revision instruction). The job
   * consumes it at generation time and the completion assessment overwrites
   * `quality` with the versioned QA payload.
   */
  quality?: Record<string, unknown> | null;
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
        ...(input.quality ? { quality: input.quality } : {}),
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

// ---------------------------------------------------------------------------
// Automatic art-refinement slide claims (plan 04, T4).
// ---------------------------------------------------------------------------

export type ArtRefinementSlideUnit = {
  rootSlideId: string;
  parentSlideId: string;
  /** Parent binding read with the completed slide; a mismatch means stale. */
  expectedParentHash: string;
};

const artRefinementLockScope = (workspaceId: string, workItemId: string) =>
  `art-refinement:${workspaceId}:${workItemId}`;

async function claimSlideAttemptInTx(
  tx: CarouselTransaction,
  scope: {
    workspaceId: string;
    workItemId: string;
    unitCredits: number;
    remainingCreditCeiling: number;
  },
  unit: ArtRefinementSlideUnit,
): Promise<ArtRefinementClaimResult | null> {
  const [replay] = await tx.select().from(creativeWorkRefinementAttempts).where(and(
    eq(creativeWorkRefinementAttempts.workspaceId, scope.workspaceId),
    eq(creativeWorkRefinementAttempts.workItemId, scope.workItemId),
    eq(creativeWorkRefinementAttempts.rootSlideId, unit.rootSlideId),
    eq(creativeWorkRefinementAttempts.parentSlideId, unit.parentSlideId),
  )).limit(1);
  if (replay) {
    return { attempt: replay.attempt, revisionKey: replay.revisionKey, replay: true };
  }

  const [parent] = await tx.select({
    id: creativeWorkCarouselSlides.id,
    updatedAt: creativeWorkCarouselSlides.updatedAt,
    outputKey: creativeWorkCarouselSlides.outputKey,
  }).from(creativeWorkCarouselSlides).where(and(
    eq(creativeWorkCarouselSlides.workspaceId, scope.workspaceId),
    eq(creativeWorkCarouselSlides.workItemId, scope.workItemId),
    eq(creativeWorkCarouselSlides.id, unit.parentSlideId),
  )).limit(1);
  if (!parent || artRefinementParentHash(parent) !== unit.expectedParentHash) return null;

  const used = await tx.select({ used: count() })
    .from(creativeWorkRefinementAttempts)
    .where(and(
      eq(creativeWorkRefinementAttempts.workspaceId, scope.workspaceId),
      eq(creativeWorkRefinementAttempts.workItemId, scope.workItemId),
      eq(creativeWorkRefinementAttempts.rootSlideId, unit.rootSlideId),
    ));
  const usedRevisions = Number(used[0]?.used ?? 0);
  if (usedRevisions >= ART_REFINEMENT_MAX_REVISIONS_PER_ROOT) return null;

  // The ceiling is shared by output and slide attempts of the same work.
  const spent = await tx.select({
    credits: sql<number>`coalesce(sum(${creativeWorkRefinementAttempts.unitCredits}), 0)`,
  }).from(creativeWorkRefinementAttempts).where(and(
    eq(creativeWorkRefinementAttempts.workspaceId, scope.workspaceId),
    eq(creativeWorkRefinementAttempts.workItemId, scope.workItemId),
  ));
  if (Number(spent[0]?.credits ?? 0) + scope.unitCredits > scope.remainingCreditCeiling) return null;

  const attempt = usedRevisions + 1;
  const revisionKey = artRefinementRevisionKey({
    workId: scope.workItemId,
    rootId: unit.rootSlideId,
    attempt,
  });
  const [row] = await tx.insert(creativeWorkRefinementAttempts).values({
    workspaceId: scope.workspaceId,
    workItemId: scope.workItemId,
    rootSlideId: unit.rootSlideId,
    parentSlideId: unit.parentSlideId,
    attempt,
    revisionKey,
    status: "claimed",
    unitCredits: scope.unitCredits,
  }).onConflictDoNothing().returning();
  if (row) return { attempt: row.attempt, revisionKey: row.revisionKey, replay: false };

  const [conflict] = await tx.select().from(creativeWorkRefinementAttempts).where(and(
    eq(creativeWorkRefinementAttempts.workspaceId, scope.workspaceId),
    eq(creativeWorkRefinementAttempts.workItemId, scope.workItemId),
    eq(creativeWorkRefinementAttempts.revisionKey, revisionKey),
  )).limit(1);
  if (!conflict) throw new Error("art_refinement_slide_claim_conflict_without_row");
  return { attempt: conflict.attempt, revisionKey: conflict.revisionKey, replay: true };
}

/**
 * Claim one automatic revision for a slide root. Same contract as the
 * output claim (replay by root+parent, stale-parent refusal, two-revision
 * cap, shared frozen ceiling), under the same per-work advisory lock.
 */
export async function claimArtRefinementSlideAttempt(input: {
  workspaceId: string;
  workItemId: string;
  rootSlideId: string;
  parentSlideId: string;
  expectedParentHash: string;
  unitCredits: number;
  remainingCreditCeiling: number;
}): Promise<ArtRefinementClaimResult | null> {
  if (!Number.isInteger(input.unitCredits) || input.unitCredits < 0) return null;
  if (!Number.isInteger(input.remainingCreditCeiling)) return null;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${artRefinementLockScope(input.workspaceId, input.workItemId)}))`,
    );
    return claimSlideAttemptInTx(tx, input, input);
  });
}

class SlideUnitsRefusedError extends Error {}

/**
 * Reserve one anchor revision plus every dependent slide rebuild in a
 * single transaction (plan 04, T4). All-or-nothing: a refusal on any unit
 * (stale parent, root cap, shared ceiling) rolls every unit back, so an
 * anchor is never authorized cheaply with its dependents left outside the
 * budget. Dependent slide ids must come from the frozen plan, never the
 * browser — the caller owns that binding.
 */
export async function claimArtRefinementSlideUnits(input: {
  workspaceId: string;
  workItemId: string;
  anchor: ArtRefinementSlideUnit | null;
  dependents: ArtRefinementSlideUnit[];
  unitCredits: number;
  remainingCreditCeiling: number;
}): Promise<ArtRefinementClaimResult[] | null> {
  if (!Number.isInteger(input.unitCredits) || input.unitCredits < 0) return null;
  if (!Number.isInteger(input.remainingCreditCeiling)) return null;
  const units = input.anchor ? [input.anchor, ...input.dependents] : input.dependents;
  if (units.length === 0) return null;
  const expected = carouselRevisionUnits({
    changesAnchor: input.anchor !== null,
    dependentSlides: input.dependents.length,
  });
  if (units.length !== expected) return null;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${artRefinementLockScope(input.workspaceId, input.workItemId)}))`,
      );
      const results: ArtRefinementClaimResult[] = [];
      for (const unit of units) {
        const claimed = await claimSlideAttemptInTx(tx, input, unit);
        if (!claimed) throw new SlideUnitsRefusedError("slide_units_refused");
        results.push(claimed);
      }
      return results;
    });
  } catch (error) {
    if (error instanceof SlideUnitsRefusedError) return null;
    throw error;
  }
}
