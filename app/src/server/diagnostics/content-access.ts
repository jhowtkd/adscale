import "server-only";

import { eq } from "drizzle-orm";

import { db } from "../db";
import { diagnosticAccessAudit } from "../db/schema";
import {
  DIAGNOSTIC_CONTENT_POLICY_VERSION,
  DIAGNOSTIC_RETENTION_WINDOWS,
  resolveContentPolicy,
  type ContentPolicyDeps,
} from "./content-policy";
import {
  isContentExpired,
  resolveContentAvailability,
  sanitizeDiagnosticContent,
  type SanitizedDiagnosticContent,
} from "./content-sanitize";
import type { ContentAvailabilityState } from "./contract";
import type { DiagnosticDatabase } from "./journal";

/**
 * Diagnostic content reads with audited access (jhowtkd/adscale#391).
 *
 * This ticket owns the audit WRITE path to `diagnostic_access_audit`
 * (table landed in #387) plus deny-on-audit-failure enforcement:
 *
 * - every content read attempts an audit row first: operator, scope, time
 *   (server clock, `occurredAt` default), resource, purpose — the row type
 *   has NO content field, so prompt text cannot land in it by construction;
 * - if the audit write fails, the read is DENIED (content withheld) while
 *   safe metadata remains readable — accountability has no silent gaps;
 * - allowed reads disclose per policy: `metadata_only` and uncollected
 *   content yield `not_collected`; expired content is reported, never
 *   reconstructed; remote outage yields `unavailable`; only allowlisted,
 *   verified `redacted` mode returns a sanitized, not-verbatim payload —
 *   and sanitize failure drops the payload but keeps the metadata.
 */

export const CONTENT_ACCESS_AUDIT_ACTION = "content.read";
export const CONTENT_POLICY_PROBE_ACTION = "policy.verify";
export const CONTENT_POLICY_PROBE_ACTOR = "system:content-policy";

export type ContentAccessAuditResult = "allowed" | "denied";

export class ContentAccessAuditError extends Error {
  readonly code: "INVALID_READ_REQUEST" | "INVALID_AUDIT_ENTRY";

  constructor(
    code: "INVALID_READ_REQUEST" | "INVALID_AUDIT_ENTRY",
    message: string,
  ) {
    super(message);
    this.name = "ContentAccessAuditError";
    this.code = code;
  }
}

const EMERGENCY_WINDOW_MS = 60_000;
const EMERGENCY_MAX_PER_WINDOW = 5;
let emergencyWindowStart = 0;
let emergencyCount = 0;

/**
 * Rate-limited emergency output for audit-write failures. Static strings
 * only — no operator, resource or reason text, no recursion.
 */
function reportAuditFailure(kind: string): void {
  try {
    const now = Date.now();
    if (now - emergencyWindowStart > EMERGENCY_WINDOW_MS) {
      emergencyWindowStart = now;
      emergencyCount = 0;
    }
    emergencyCount += 1;
    if (emergencyCount <= EMERGENCY_MAX_PER_WINDOW) {
      console.error(
        `[content-access] ${kind}; content withheld, metadata only`,
      );
    }
  } catch {
    // The emergency path must never throw either.
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface RecordContentAccessAuditInput {
  operatorId: string;
  scope: string;
  workspaceId: string;
  workItemId: string;
  resource: string;
  action: string;
  reason: string;
  result: ContentAccessAuditResult;
}

/**
 * Append one attribution-only audit row. Validates strictly (programmer
 * errors throw `ContentAccessAuditError` before any I/O); storage failures
 * propagate so the read path can deny. Never records content.
 */
export async function recordContentAccessAudit(
  input: RecordContentAccessAuditInput,
  database: DiagnosticDatabase = db,
): Promise<{ id: string }> {
  const fields = [
    "operatorId",
    "scope",
    "workspaceId",
    "workItemId",
    "resource",
    "action",
    "reason",
  ] as const;
  for (const field of fields) {
    if (!isNonEmptyString(input?.[field])) {
      throw new ContentAccessAuditError(
        "INVALID_AUDIT_ENTRY",
        `recordContentAccessAudit: ${field} must be a non-empty string`,
      );
    }
  }
  if (input?.result !== "allowed" && input?.result !== "denied") {
    throw new ContentAccessAuditError(
      "INVALID_AUDIT_ENTRY",
      'recordContentAccessAudit: result must be "allowed" or "denied"',
    );
  }
  const [row] = await database
    .insert(diagnosticAccessAudit)
    .values({
      operatorId: input.operatorId,
      scope: input.scope,
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      resource: input.resource,
      action: input.action,
      reason: input.reason,
      result: input.result,
    })
    .returning({ id: diagnosticAccessAudit.id });
  return { id: row.id };
}

/**
 * Prove the audit write path works: write a probe row and read it back.
 * Used as the access verifier for `resolveContentPolicy`. Never throws.
 */
export async function probeContentAccessPath(
  workspaceId: string,
  database: DiagnosticDatabase = db,
): Promise<boolean> {
  try {
    if (!isNonEmptyString(workspaceId)) return false;
    const { id } = await recordContentAccessAudit(
      {
        operatorId: CONTENT_POLICY_PROBE_ACTOR,
        scope: "platform-owner",
        workspaceId,
        workItemId: "content-policy-probe",
        resource: `policy-probe:${workspaceId}`,
        action: CONTENT_POLICY_PROBE_ACTION,
        reason: "content-policy access verification probe",
        result: "allowed",
      },
      database,
    );
    const rows = await database
      .select({ id: diagnosticAccessAudit.id })
      .from(diagnosticAccessAudit)
      .where(eq(diagnosticAccessAudit.id, id));
    return rows.length === 1 && rows[0].id === id;
  } catch {
    return false;
  }
}

/** Safe model-call facts: always readable, even when content is denied. */
export interface DiagnosticContentMetadata {
  callId: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  providerRequestId: string | null;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ReadDiagnosticContentInput {
  operatorId: string;
  scope: string;
  workspaceId: string;
  workItemId: string;
  callId: string;
  /** Purpose of the read, recorded in the audit row (never the prompt). */
  reason: string;
  /** ISO timestamp of the content, for the expiry check. */
  occurredAt: string;
  /** Candidate content — touched only in allowed `redacted` disclosure. */
  content?: unknown;
  metadata: DiagnosticContentMetadata;
}

export interface ReadDiagnosticContentDeps {
  database?: DiagnosticDatabase;
  policyDeps?: ContentPolicyDeps;
  /** False marks content unavailable (Langfuse outage); default true. */
  remoteReachable?: boolean;
  now?: Date;
  retentionDays?: number;
}

export interface ReadDiagnosticContentResult {
  allowed: boolean;
  availability: ContentAvailabilityState;
  policyVersion: string;
  metadata: DiagnosticContentMetadata;
  content: SanitizedDiagnosticContent | null;
  auditId: string | null;
}

function isMetadata(value: unknown): value is DiagnosticContentMetadata {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    isNonEmptyString(record["callId"]) &&
    isNonEmptyString(record["provider"]) &&
    isNonEmptyString(record["requestedModel"])
  );
}

function validateReadInput(input: ReadDiagnosticContentInput): void {
  const fields = [
    "operatorId",
    "scope",
    "workspaceId",
    "workItemId",
    "callId",
    "reason",
  ] as const;
  for (const field of fields) {
    if (!isNonEmptyString(input?.[field])) {
      throw new ContentAccessAuditError(
        "INVALID_READ_REQUEST",
        `readDiagnosticContent: ${field} must be a non-empty string`,
      );
    }
  }
  if (!isNonEmptyString(input?.occurredAt)) {
    throw new ContentAccessAuditError(
      "INVALID_READ_REQUEST",
      "readDiagnosticContent: occurredAt must be a non-empty string",
    );
  }
  if (!isMetadata(input?.metadata)) {
    throw new ContentAccessAuditError(
      "INVALID_READ_REQUEST",
      "readDiagnosticContent: metadata must carry callId/provider/requestedModel",
    );
  }
}

async function resolveModeSafely(
  workspaceId: string,
  policyDeps?: ContentPolicyDeps,
) {
  try {
    return await resolveContentPolicy(workspaceId, policyDeps);
  } catch {
    return "metadata_only" as const;
  }
}

/**
 * Audited content read. Records the attempt first; on audit failure the
 * read is denied with metadata intact. On success discloses per policy —
 * expired content is reported without reconstruction, outage yields
 * `unavailable`, and sanitize failure drops the payload, never the record.
 */
export async function readDiagnosticContent(
  input: ReadDiagnosticContentInput,
  deps: ReadDiagnosticContentDeps = {},
): Promise<ReadDiagnosticContentResult> {
  validateReadInput(input);
  const policyVersion = DIAGNOSTIC_CONTENT_POLICY_VERSION;
  const metadata = input.metadata;
  const remoteReachable = deps.remoteReachable !== false;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const retentionDays =
    typeof deps.retentionDays === "number"
      ? deps.retentionDays
      : DIAGNOSTIC_RETENTION_WINDOWS.aiTracesDays;

  const mode = await resolveModeSafely(input.workspaceId, deps.policyDeps);
  const expired = isContentExpired(input.occurredAt, now, retentionDays);
  // Availability preview without touching content: the deny path and the
  // no-disclosure paths return it directly.
  const preview = resolveContentAvailability({
    mode,
    collected: input.content !== undefined,
    truncated: false,
    expired,
    remoteReachable,
  });

  let auditId: string;
  try {
    ({ id: auditId } = await recordContentAccessAudit(
      {
        operatorId: input.operatorId,
        scope: input.scope,
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        resource: `call:${input.callId}`,
        action: CONTENT_ACCESS_AUDIT_ACTION,
        reason: input.reason,
        result: "allowed",
      },
      deps.database ?? db,
    ));
  } catch {
    reportAuditFailure("audit-write-failed-read-denied");
    return {
      allowed: false,
      availability: preview.availability,
      policyVersion,
      metadata,
      content: null,
      auditId: null,
    };
  }

  if (
    expired ||
    mode !== "redacted" ||
    !remoteReachable ||
    input.content === undefined
  ) {
    return {
      allowed: true,
      availability: preview.availability,
      policyVersion,
      metadata,
      content: null,
      auditId,
    };
  }
  const sanitized = sanitizeDiagnosticContent(input.content);
  if (!sanitized) {
    return {
      allowed: true,
      availability: "unavailable",
      policyVersion,
      metadata,
      content: null,
      auditId,
    };
  }
  return {
    allowed: true,
    availability: sanitized.availability,
    policyVersion,
    metadata,
    content: sanitized,
    auditId,
  };
}
