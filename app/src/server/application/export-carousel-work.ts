import "server-only";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import JSZip from "jszip";
import pLimit from "p-limit";
import { and, eq } from "drizzle-orm";
import {
  resolveCarouselPreparedSnapshot,
  type CarouselCopyAuthority,
  type CarouselNarrativeRole,
} from "@/server/creative-work/carousel-contracts";
import type {
  CreativeWorkCarouselSlide,
  CreativeWorkItem,
} from "@/server/db/schema";
import { creativeWorkItems } from "@/server/db/schema";
import { db } from "@/server/db";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  approveCarouselDeckRevision,
  listCurrentCarouselSlides,
} from "@/server/repositories/creative-work-carousel";
import { objectStorage } from "@/server/storage";

/**
 * Deck approval and ordered export (Task 7): all objective approval checks
 * run against one consistent read, only `carouselApprovedRevision` is written,
 * and the ZIP export materializes `01.png`…`NN.png` plus a metadata-free
 * manifest in position order. No export row or table is added.
 */

export type CarouselManifestSlideV1 = {
  position: number;
  fileName: string;
  slideId: string;
  lineageId: string;
  versionNumber: number;
  role: CarouselNarrativeRole;
  primaryText: string;
  secondaryText: string | null;
  copyAuthority: CarouselCopyAuthority;
  sourceFactIds: string[];
  outputHash: string;
};

export type CarouselManifestV1 = {
  version: 1;
  workId: string;
  deckRevision: string;
  format: "4:5" | "1:1";
  visualContractHash: string;
  approvedAt: string;
  slides: CarouselManifestSlideV1[];
};

export type CarouselManifestSlideInput = Pick<
  CreativeWorkCarouselSlide,
  | "position"
  | "lineageId"
  | "versionNumber"
  | "role"
  | "primaryText"
  | "secondaryText"
  | "copyAuthority"
  | "sourceFactIds"
> & { outputHash: string };

/**
 * Pure manifest construction: slide ids come from the frozen deck plan, the
 * contract hash from the frozen visual contract. No storage keys, prompts or
 * provider metadata ever enter the manifest.
 */
export function buildCarouselManifest(input: {
  work: Pick<CreativeWorkItem, "id" | "inputSnapshot">;
  deckRevision: string;
  approvedAt: string;
  slides: CarouselManifestSlideInput[];
}): CarouselManifestV1 {
  const snapshot = resolveCarouselPreparedSnapshot(input.work.inputSnapshot);
  if (!snapshot) throw new Error("carousel_prepared_snapshot_missing");
  const ordered = [...input.slides].sort((left, right) => left.position - right.position);
  return {
    version: 1,
    workId: input.work.id,
    deckRevision: input.deckRevision,
    format: snapshot.deck.format,
    visualContractHash: snapshot.visualContract.contractHash,
    approvedAt: input.approvedAt,
    slides: ordered.map((slide) => ({
      position: slide.position,
      fileName: `${String(slide.position).padStart(2, "0")}.png`,
      slideId:
        snapshot.deck.slides.find((plan) => plan.position === slide.position)?.slideId ?? "",
      lineageId: slide.lineageId,
      versionNumber: slide.versionNumber,
      role: slide.role,
      primaryText: slide.primaryText,
      secondaryText: slide.secondaryText,
      copyAuthority: slide.copyAuthority,
      sourceFactIds: slide.sourceFactIds,
      outputHash: slide.outputHash,
    })),
  };
}

export type ApproveCarouselDeckErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "stale_input"
  | "revision_conflict"
  | "deck_not_ready";

export type ApproveCarouselDeckFindingCode =
  | "missing_position"
  | "non_contiguous"
  | "foreign_workspace"
  | "slide_not_completed"
  | "contract_hash_mismatch"
  | "objective_failed";

export type ApproveCarouselDeckFinding = {
  path: string;
  code: ApproveCarouselDeckFindingCode;
  message: string;
};

export type ApproveCarouselDeckResult =
  | { ok: true; value: { work: CreativeWorkItem; replay: boolean } }
  | { ok: false; error: { code: ApproveCarouselDeckErrorCode; details?: unknown } };

/**
 * Approves the current deck revision. Every objective check runs against one
 * transaction read: exact positions 1..N, contiguous order, only completed
 * current slides, matching frozen contract hashes, workspace ownership and
 * no objective slide failure. Advisory set-review warnings never block.
 */
export async function approveCarouselDeck(input: {
  workspaceId: string;
  workItemId: string;
  revision: string;
}): Promise<ApproveCarouselDeckResult> {
  return db.transaction(async (tx) => {
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
    if (!work) return { ok: false as const, error: { code: "work_not_found" as const } };
    if (work.toolKind !== "carousel") {
      return { ok: false as const, error: { code: "work_not_carousel" as const } };
    }
    const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
    if (!snapshot) return { ok: false as const, error: { code: "stale_input" as const } };
    if (snapshot.deck.revision !== input.revision) {
      return {
        ok: false as const,
        error: {
          code: "revision_conflict" as const,
          details: { current: snapshot.deck.revision, received: input.revision },
        },
      };
    }

    const slides = await listCurrentCarouselSlides(input.workspaceId, input.workItemId, tx);
    const findings: ApproveCarouselDeckFinding[] = [];
    const expectedPositions = Array.from(
      { length: snapshot.deck.slides.length },
      (_, index) => index + 1,
    );
    const occupied = new Set(slides.map((slide) => slide.position));
    for (const position of expectedPositions) {
      if (!occupied.has(position)) {
        findings.push({
          path: `positions.${position}`,
          code: "missing_position",
          message: `position ${position} has no current slide`,
        });
      }
    }
    const sorted = [...slides].sort((left, right) => left.position - right.position);
    const contiguous =
      sorted.length === expectedPositions.length &&
      sorted.every((slide, index) => slide.position === expectedPositions[index]);
    if (!contiguous) {
      findings.push({
        path: "positions",
        code: "non_contiguous",
        message: "current slide positions are not exactly 1..N",
      });
    }
    for (const slide of sorted) {
      if (slide.workspaceId !== input.workspaceId) {
        findings.push({
          path: `slides.${slide.position}`,
          code: "foreign_workspace",
          message: "slide does not belong to the workspace",
        });
      }
      if (slide.status !== "completed" || !slide.outputKey) {
        findings.push({
          path: `slides.${slide.position}`,
          code: "slide_not_completed",
          message: `slide status is ${slide.status}`,
        });
      }
      if (slide.visualContractHash !== snapshot.visualContract.contractHash) {
        findings.push({
          path: `slides.${slide.position}`,
          code: "contract_hash_mismatch",
          message: "slide was generated under a different visual contract",
        });
      }
      if ((slide.quality as { objectivePassed?: unknown } | null)?.objectivePassed === false) {
        findings.push({
          path: `slides.${slide.position}`,
          code: "objective_failed",
          message: "slide objective QA failed",
        });
      }
    }
    if (findings.length > 0) {
      return {
        ok: false as const,
        error: { code: "deck_not_ready" as const, details: { findings } },
      };
    }

    if (work.carouselApprovedRevision === input.revision) {
      return { ok: true as const, value: { work, replay: true } };
    }
    const updated = await approveCarouselDeckRevision({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      deckRevision: input.revision,
    });
    if (!updated) return { ok: false as const, error: { code: "work_not_found" as const } };
    return { ok: true as const, value: { work: updated, replay: false } };
  });
}

export type ExportCarouselWorkErrorCode =
  | "work_not_found"
  | "work_not_carousel"
  | "stale_input"
  | "deck_not_approved"
  | "deck_not_ready"
  | "export_failed";

export type ExportCarouselWorkResult =
  | {
      ok: true;
      value: {
        manifest: CarouselManifestV1;
        stream: NodeJS.ReadableStream;
        fileName: string;
      };
    }
  | { ok: false; error: { code: ExportCarouselWorkErrorCode; details?: unknown } };

/**
 * Exports the approved deck: requires `carouselApprovedRevision` to equal the
 * current deck revision, loads the completed slide buffers with bounded
 * concurrency, hashes the final buffers, and streams `01.png`…`NN.png` plus
 * `manifest.json` in position order regardless of the database return order.
 */
export async function exportCarouselWork(input: {
  workspaceId: string;
  workItemId: string;
}): Promise<ExportCarouselWorkResult> {
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };
  const { work } = aggregate;
  if (work.toolKind !== "carousel") {
    return { ok: false, error: { code: "work_not_carousel", details: { toolKind: work.toolKind } } };
  }
  const snapshot = resolveCarouselPreparedSnapshot(work.inputSnapshot);
  if (!snapshot) return { ok: false, error: { code: "stale_input" } };

  const deckRevision = snapshot.deck.revision;
  if (work.carouselApprovedRevision !== deckRevision) {
    return {
      ok: false,
      error: {
        code: "deck_not_approved",
        details: { approved: work.carouselApprovedRevision, current: deckRevision },
      },
    };
  }

  const slides = (await listCurrentCarouselSlides(input.workspaceId, input.workItemId)).sort(
    (left, right) => left.position - right.position,
  );
  const expectedPositions = Array.from(
    { length: snapshot.deck.slides.length },
    (_, index) => index + 1,
  );
  const incomplete =
    slides.length !== expectedPositions.length ||
    slides.some(
      (slide, index) =>
        slide.position !== expectedPositions[index] ||
        slide.status !== "completed" ||
        !slide.outputKey,
    );
  if (incomplete) {
    return {
      ok: false,
      error: {
        code: "deck_not_ready",
        details: { findings: [{ path: "slides", code: "deck_not_completed", message: "the current deck is not fully completed" }] },
      },
    };
  }

  const limit = pLimit(4);
  let buffers: Buffer[];
  try {
    buffers = await Promise.all(
      slides.map((slide) =>
        limit(async () => {
          const buffer = await objectStorage.get(slide.outputKey as string);
          if (!buffer) throw new Error(`carousel slide buffer missing: ${slide.outputKey}`);
          return buffer;
        }),
      ),
    );
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "export_failed",
        details: { reason: error instanceof Error ? error.message : String(error) },
      },
    };
  }

  const manifest = buildCarouselManifest({
    work,
    deckRevision,
    approvedAt: work.updatedAt.toISOString(),
    slides: slides.map((slide, index) => ({
      position: slide.position,
      lineageId: slide.lineageId,
      versionNumber: slide.versionNumber,
      role: slide.role,
      primaryText: slide.primaryText,
      secondaryText: slide.secondaryText,
      copyAuthority: slide.copyAuthority,
      sourceFactIds: slide.sourceFactIds,
      outputHash: createHash("sha256").update(buffers[index]).digest("hex"),
    })),
  });

  const zip = new JSZip();
  slides.forEach((slide, index) => {
    zip.file(`${String(slide.position).padStart(2, "0")}.png`, buffers[index]);
  });
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const stream: NodeJS.ReadableStream = Readable.from(zipBuffer);

  return {
    ok: true,
    value: { manifest, stream, fileName: `carousel-${work.id}.zip` },
  };
}
