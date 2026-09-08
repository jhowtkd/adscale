import { getCreativeWorkSelectionPolicy } from "@/lib/creative-work-selection-policy";

export const PIECE_REVIEW_DECISIONS = ["comment", "approve", "request_changes"] as const;
export type PieceReviewDecision = (typeof PIECE_REVIEW_DECISIONS)[number];

export type PieceReviewArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PieceReviewAccess = "valid" | "invalid" | "expired" | "removed";

export type PieceReviewEntry = {
  outputId: string;
  outputVersion: number;
  authorLabel: string;
  decision: PieceReviewDecision;
  body: string | null;
  area: PieceReviewArea | null;
};

const AUTHOR_MAX = 80;
const BODY_MAX = 2000;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPieceReviewDecision(value: unknown): value is PieceReviewDecision {
  return typeof value === "string" && (PIECE_REVIEW_DECISIONS as readonly string[]).includes(value);
}

export function isPieceReviewLink(link: {
  creativeWorkId?: string | null;
  outputId?: string | null;
  outputVersion?: number | null;
}): boolean {
  return Boolean(link.creativeWorkId && link.outputId && typeof link.outputVersion === "number");
}

/**
 * Guests only see the authorized output. Expired or revoked tokens lose access.
 */
export function assertGuestPackageAccess(input: {
  tokenStatus: PieceReviewAccess;
  requestedOutputId: string;
  authorizedOutputId: string | null | undefined;
}): { ok: true } | { ok: false; error: "share_unavailable" | "package_forbidden" } {
  if (input.tokenStatus !== "valid") return { ok: false, error: "share_unavailable" };
  if (!input.authorizedOutputId) return { ok: false, error: "package_forbidden" };
  if (input.requestedOutputId !== input.authorizedOutputId) {
    return { ok: false, error: "package_forbidden" };
  }
  return { ok: true };
}

export function normalizeAuthorLabel(
  value: unknown,
): { ok: true; label: string } | { ok: false; error: "author_required" } {
  if (typeof value !== "string") return { ok: false, error: "author_required" };
  const label = value.trim().slice(0, AUTHOR_MAX);
  if (!label) return { ok: false, error: "author_required" };
  return { ok: true, label };
}

export function normalizeReviewBody(
  value: unknown,
  decision: PieceReviewDecision,
): { ok: true; body: string | null } | { ok: false; error: "body_required" } {
  const body = typeof value === "string" ? value.trim().slice(0, BODY_MAX) : "";
  if (decision === "approve") return { ok: true, body: body || null };
  if (!body) return { ok: false, error: "body_required" };
  return { ok: true, body };
}

export function normalizeReviewArea(
  value: unknown,
): { ok: true; area: PieceReviewArea | null } | { ok: false; error: "invalid_area" } {
  if (value == null) return { ok: true, area: null };
  if (!value || typeof value !== "object") return { ok: false, error: "invalid_area" };
  const box = value as PieceReviewArea;
  if (![box.x, box.y, box.width, box.height].every(isFiniteNumber)) {
    return { ok: false, error: "invalid_area" };
  }
  if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
    return { ok: false, error: "invalid_area" };
  }
  if (box.x + box.width > 1.0001 || box.y + box.height > 1.0001) {
    return { ok: false, error: "invalid_area" };
  }
  return {
    ok: true,
    area: {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    },
  };
}

/**
 * Feedback always records the exact output version frozen on the share link.
 */
export function pinReviewToVersion(input: {
  authorizedOutputId: string;
  authorizedVersion: number;
  requestedOutputId: string;
}): { ok: true; outputId: string; outputVersion: number } | { ok: false; error: "version_mismatch" } {
  if (input.requestedOutputId !== input.authorizedOutputId) {
    return { ok: false, error: "version_mismatch" };
  }
  if (!Number.isInteger(input.authorizedVersion) || input.authorizedVersion < 1) {
    return { ok: false, error: "version_mismatch" };
  }
  return {
    ok: true,
    outputId: input.authorizedOutputId,
    outputVersion: input.authorizedVersion,
  };
}

/**
 * External approval is a guest signal. It never overrides an objective rejection.
 */
export function assertExternalApprovalAllowed(
  quality: unknown,
  decision: PieceReviewDecision,
): { ok: true } | { ok: false; error: "objective_rejection" } {
  if (decision !== "approve") return { ok: true };
  const policy = getCreativeWorkSelectionPolicy(quality);
  if (!policy.selectable) return { ok: false, error: "objective_rejection" };
  return { ok: true };
}

export function buildPieceReviewEntry(input: {
  outputId: string;
  outputVersion: number;
  authorLabel: string;
  decision: PieceReviewDecision;
  body: string | null;
  area: PieceReviewArea | null;
}): PieceReviewEntry {
  return {
    outputId: input.outputId,
    outputVersion: input.outputVersion,
    authorLabel: input.authorLabel,
    decision: input.decision,
    body: input.body,
    area: input.area,
  };
}
