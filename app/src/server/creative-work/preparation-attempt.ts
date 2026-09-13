import { createHash } from "node:crypto";
import { canonicalJsonStringify } from "./canonical-json";

export type PreparationKind = "creative_prepare" | "carousel_plan" | "carousel_prepare";
export type PreparationAttemptState = "running" | "completed" | "failed" | "invalidated";

export type PreparationAttempt = {
  id: string;
  workspaceId: string;
  workItemId: string;
  kind: PreparationKind;
  inputRevision: string;
  inputFingerprint: string;
  state: PreparationAttemptState;
  leaseExpiresAt: string;
};

export function preparationInputFingerprint(input: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(input)).digest("hex");
}

export function isAttemptUsable(
  attempt: Pick<PreparationAttempt, "state" | "leaseExpiresAt">,
  now: Date,
): boolean {
  return attempt.state === "running" && new Date(attempt.leaseExpiresAt).getTime() > now.getTime();
}

export function canFinalizeAttempt(input: {
  attempt: Pick<PreparationAttempt, "id" | "state" | "inputRevision" | "inputFingerprint" | "leaseExpiresAt">;
  finalizingAttemptId: string;
  currentRevision: string;
  currentFingerprint: string;
  now: Date;
}): { ok: true } | { ok: false; reason: "not_owner" | "not_running" | "revision_changed" | "fingerprint_changed" | "lease_expired" } {
  const { attempt } = input;
  if (attempt.id !== input.finalizingAttemptId) return { ok: false, reason: "not_owner" };
  if (attempt.state !== "running") return { ok: false, reason: "not_running" };
  if (new Date(attempt.leaseExpiresAt).getTime() <= input.now.getTime()) {
    return { ok: false, reason: "lease_expired" };
  }
  if (attempt.inputRevision !== input.currentRevision) return { ok: false, reason: "revision_changed" };
  if (attempt.inputFingerprint !== input.currentFingerprint) return { ok: false, reason: "fingerprint_changed" };
  return { ok: true };
}
