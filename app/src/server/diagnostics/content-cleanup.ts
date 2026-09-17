import "server-only";

import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";

import { db } from "../db";
import { diagnosticAccessAudit, diagnosticEvents } from "../db/schema";
import { DIAGNOSTIC_RETENTION_WINDOWS } from "./content-policy";
import type { CleanupDiagnosticData } from "./contract";
import type { DiagnosticDatabase } from "./journal";

/**
 * Diagnostic data retention cleanup (jhowtkd/adscale#391).
 *
 * Deletes locally expired rows (diagnostic index 30d, access audit 90d)
 * and drives remote AI-trace deletion (7d) through a client that exposes
 * ONLY delete + re-query — there is no dataset/import operation, so pilot
 * data can never be copied into vendor datasets through this path.
 *
 * Rules:
 * - dry-run is the DEFAULT: without `dryRun: false` nothing is written,
 *   locally or remotely; the report lists expired rows and candidates;
 * - remote deletion is always re-queried and the confirmation recorded
 *   per trace (`confirmed` requires accepted delete + re-query miss —
 *   acceptance alone is not removal), and the remote phase runs BEFORE
 *   local deletes so trace references survive until confirmation;
 * - runs are bounded (`limit` per table, sequential remote calls);
 * - capture shutdown never disables cleanup: this module consults no
 *   capture flag, and deletes nothing except expired rows.
 *
 * The remote client is proven against a FAKE endpoint only (tests spin a
 * local HTTP server). No real Langfuse credentials or calls exist here.
 */

export const DIAGNOSTIC_CLEANUP_DEFAULT_LIMIT = 1000;
export const REMOTE_DELETION_TIMEOUT_MS = 5_000;

const DAY_MS = 86_400_000;
const MAX_ERROR_LENGTH = 300;

export class DiagnosticCleanupError extends Error {
  readonly code = "INVALID_CLEANUP_INPUT";

  constructor(message: string) {
    super(message);
    this.name = "DiagnosticCleanupError";
  }
}

/**
 * Remote trace store surface: delete + re-query ONLY. Deliberately no
 * dataset, import, export or upsert operation exists on this interface.
 */
export interface RemoteTraceDeletionClient {
  deleteTrace(traceId: string): Promise<{ accepted: boolean }>;
  getTrace(traceId: string): Promise<{ found: boolean }>;
}

export interface RemoteDeletionConfirmation {
  traceId: string;
  deleteAccepted: boolean;
  /** Null when the re-query itself errored (inconclusive, not confirmed). */
  requeryFound: boolean | null;
  confirmed: boolean;
  confirmedAt: string | null;
  error: string | null;
}

function boundError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH
    ? message.slice(0, MAX_ERROR_LENGTH)
    : message;
}

export interface HttpRemoteDeletionClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

/**
 * HTTP deletion client for the fake-proven contract: DELETE + GET on
 * `{baseUrl}/traces/{id}`. A DELETE 404 counts as accepted (idempotent —
 * the re-query still decides confirmation); other failures surface as
 * unaccepted deletes or re-query errors on the confirmation record.
 */
export function createHttpRemoteDeletionClient(
  options: HttpRemoteDeletionClientOptions,
): RemoteTraceDeletionClient {
  const base = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REMOTE_DELETION_TIMEOUT_MS;
  const headers = options.headers;

  async function request(
    method: "GET" | "DELETE",
    traceId: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(
        `${base}/traces/${encodeURIComponent(traceId)}`,
        { method, ...(headers ? { headers } : {}), signal: controller.signal },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    deleteTrace: async (traceId: string) => {
      const response = await request("DELETE", traceId);
      if (response.status === 404) return { accepted: true };
      return { accepted: response.ok };
    },
    getTrace: async (traceId: string) => {
      const response = await request("GET", traceId);
      if (response.status === 404) return { found: false };
      if (!response.ok) {
        throw new Error(`remote re-query failed: HTTP ${response.status}`);
      }
      return { found: true };
    },
  };
}

/**
 * Delete one remote trace and re-query it, recording the confirmation.
 * Never throws: every failure mode lands on the returned record.
 */
export async function deleteRemoteTraceWithConfirmation(
  client: RemoteTraceDeletionClient,
  traceId: string,
): Promise<RemoteDeletionConfirmation> {
  const entry: RemoteDeletionConfirmation = {
    traceId: typeof traceId === "string" ? traceId : String(traceId),
    deleteAccepted: false,
    requeryFound: null,
    confirmed: false,
    confirmedAt: null,
    error: null,
  };
  try {
    if (typeof traceId !== "string" || traceId.trim().length === 0) {
      return { ...entry, error: "traceId must be a non-empty string" };
    }
    try {
      entry.deleteAccepted =
        (await client.deleteTrace(traceId)).accepted === true;
    } catch (error) {
      return { ...entry, error: `delete failed: ${boundError(error)}` };
    }
    try {
      entry.requeryFound = (await client.getTrace(traceId)).found === true;
    } catch (error) {
      return { ...entry, error: `re-query failed: ${boundError(error)}` };
    }
    if (entry.deleteAccepted && entry.requeryFound === false) {
      entry.confirmed = true;
      entry.confirmedAt = new Date().toISOString();
    }
    return entry;
  } catch (error) {
    return { ...entry, error: boundError(error) };
  }
}

/**
 * Full delete + re-query probe for one trace id, for policy verification
 * (`resolveContentPolicy` deletion side). Never throws.
 */
export async function probeRemoteDeletion(
  client: RemoteTraceDeletionClient,
  traceId: string,
): Promise<boolean> {
  try {
    const confirmation = await deleteRemoteTraceWithConfirmation(
      client,
      traceId,
    );
    return confirmation.confirmed;
  } catch {
    return false;
  }
}

export interface CleanupDiagnosticDataOptions {
  /** Default true: report only, no local or remote writes. */
  dryRun?: boolean;
  database?: DiagnosticDatabase;
  /** Null/omitted: the remote step is reported as unconfigured. */
  remoteClient?: RemoteTraceDeletionClient | null;
  /** Max rows per table (and remote candidates) per run. Default 1000. */
  limit?: number;
  /** Optional scope to a single workspace (tests + pilot ops). */
  workspaceId?: string;
}

export interface CleanupTableResult {
  expired: number;
  deleted: number;
  /** True when `limit` was hit — more rows may remain. */
  capped: boolean;
}

export interface CleanupDiagnosticDataResult {
  dryRun: boolean;
  at: string;
  retentionWindows: typeof DIAGNOSTIC_RETENTION_WINDOWS;
  local: {
    diagnosticEvents: CleanupTableResult;
    accessAudit: CleanupTableResult;
  };
  remote: {
    configured: boolean;
    candidates: string[];
    traces: RemoteDeletionConfirmation[];
  };
}

async function collectExpiredEventIds(
  database: DiagnosticDatabase,
  occurredBefore: Date,
  workspaceId: string | undefined,
  limit: number,
): Promise<string[]> {
  const rows = await database
    .select({ id: diagnosticEvents.id })
    .from(diagnosticEvents)
    .where(
      and(
        lt(diagnosticEvents.occurredAt, occurredBefore),
        workspaceId === undefined
          ? undefined
          : eq(diagnosticEvents.workspaceId, workspaceId),
      ),
    )
    .limit(limit);
  return rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}

async function collectExpiredAuditIds(
  database: DiagnosticDatabase,
  occurredBefore: Date,
  workspaceId: string | undefined,
  limit: number,
): Promise<string[]> {
  const rows = await database
    .select({ id: diagnosticAccessAudit.id })
    .from(diagnosticAccessAudit)
    .where(
      and(
        lt(diagnosticAccessAudit.occurredAt, occurredBefore),
        workspaceId === undefined
          ? undefined
          : eq(diagnosticAccessAudit.workspaceId, workspaceId),
      ),
    )
    .limit(limit);
  return rows
    .map((row) => row.id)
    .filter((id): id is string => typeof id === "string");
}

async function collectExpiredTraceIds(
  database: DiagnosticDatabase,
  occurredBefore: Date,
  workspaceId: string | undefined,
  limit: number,
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ traceId: diagnosticEvents.langfuseTraceId })
    .from(diagnosticEvents)
    .where(
      and(
        isNotNull(diagnosticEvents.langfuseTraceId),
        lt(diagnosticEvents.occurredAt, occurredBefore),
        workspaceId === undefined
          ? undefined
          : eq(diagnosticEvents.workspaceId, workspaceId),
      ),
    )
    .limit(limit);
  return rows
    .map((row) => row.traceId)
    .filter(
      (traceId): traceId is string =>
        typeof traceId === "string" && traceId.length > 0,
    );
}

async function runCleanup(
  now: Date,
  options: CleanupDiagnosticDataOptions = {},
): Promise<CleanupDiagnosticDataResult> {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new DiagnosticCleanupError(
      "cleanupDiagnosticData: now must be a valid Date",
    );
  }
  const limit = options.limit ?? DIAGNOSTIC_CLEANUP_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new DiagnosticCleanupError(
      `cleanupDiagnosticData: limit must be a positive integer, got ${String(options.limit)}`,
    );
  }
  const workspaceId = options.workspaceId;
  if (workspaceId !== undefined && workspaceId.trim().length === 0) {
    throw new DiagnosticCleanupError(
      "cleanupDiagnosticData: workspaceId must be a non-empty string when provided",
    );
  }
  const database = options.database ?? db;
  const dryRun = options.dryRun !== false;
  const windows = DIAGNOSTIC_RETENTION_WINDOWS;
  const eventCutoff = new Date(
    now.getTime() - windows.diagnosticIndexDays * DAY_MS,
  );
  const auditCutoff = new Date(
    now.getTime() - windows.accessAuditDays * DAY_MS,
  );

  const expiredEventIds = await collectExpiredEventIds(
    database,
    eventCutoff,
    workspaceId,
    limit,
  );
  const expiredAuditIds = await collectExpiredAuditIds(
    database,
    auditCutoff,
    workspaceId,
    limit,
  );

  // Remote phase FIRST: the journal rows scheduled for local deletion
  // carry the trace references, and references needed for exclusion are
  // kept until the remote removal is confirmed by re-query.
  const remoteClient = options.remoteClient ?? null;
  let candidates: string[] = [];
  const traces: RemoteDeletionConfirmation[] = [];
  if (remoteClient) {
    const tracesCutoff = new Date(
      now.getTime() - windows.aiTracesDays * DAY_MS,
    );
    candidates = await collectExpiredTraceIds(
      database,
      tracesCutoff,
      workspaceId,
      limit,
    );
    if (!dryRun) {
      // Sequential: respect remote rate limits; each trace is re-queried.
      for (const traceId of candidates) {
        traces.push(
          await deleteRemoteTraceWithConfirmation(remoteClient, traceId),
        );
      }
    }
  }

  let deletedEvents = 0;
  let deletedAudit = 0;
  if (!dryRun) {
    if (expiredEventIds.length > 0) {
      const removed = await database
        .delete(diagnosticEvents)
        .where(inArray(diagnosticEvents.id, expiredEventIds))
        .returning({ id: diagnosticEvents.id });
      deletedEvents = removed.length;
    }
    if (expiredAuditIds.length > 0) {
      const removed = await database
        .delete(diagnosticAccessAudit)
        .where(inArray(diagnosticAccessAudit.id, expiredAuditIds))
        .returning({ id: diagnosticAccessAudit.id });
      deletedAudit = removed.length;
    }
  }

  return {
    dryRun,
    at: now.toISOString(),
    retentionWindows: windows,
    local: {
      diagnosticEvents: {
        expired: expiredEventIds.length,
        deleted: deletedEvents,
        capped: expiredEventIds.length === limit,
      },
      accessAudit: {
        expired: expiredAuditIds.length,
        deleted: deletedAudit,
        capped: expiredAuditIds.length === limit,
      },
    },
    remote:
      remoteClient === null
        ? { configured: false, candidates: [], traces: [] }
        : { configured: true, candidates, traces },
  };
}

/**
 * Frozen-compatible cleanup with an options extension point (dry-run,
 * scoping, remote client). Assignable to `CleanupDiagnosticData`.
 */
export type CleanupDiagnosticDataWithDeps = (
  now: Date,
  options?: CleanupDiagnosticDataOptions,
) => Promise<CleanupDiagnosticDataResult>;

export const cleanupDiagnosticData: CleanupDiagnosticDataWithDeps = (
  now: Date,
  options?: CleanupDiagnosticDataOptions,
) => runCleanup(now, options);

export type { CleanupDiagnosticData };

export interface CleanupArgPlan {
  dryRun: boolean;
  workspaceId?: string;
  limit: number;
}

export type ParseCleanupArgsResult =
  | { ok: true; plan: CleanupArgPlan }
  | { ok: false; error: string };

/**
 * Parse `diagnostics:cleanup` CLI args (see app/scripts/cleanup-diagnostic-data.ts).
 * Dry-run is the default; only `--apply` writes. Pure — tested below.
 */
export function parseCleanupArgs(argv: string[]): ParseCleanupArgsResult {
  let dryRun = true;
  let workspaceId: string | undefined;
  let limit = DIAGNOSTIC_CLEANUP_DEFAULT_LIMIT;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--apply") {
      dryRun = false;
    } else if (arg === "--workspace") {
      const value = argv[index + 1];
      if (value === undefined || value.trim().length === 0) {
        return { ok: false, error: "--workspace requires a value" };
      }
      workspaceId = value;
      index += 1;
    } else if (arg === "--limit") {
      const value = argv[index + 1];
      const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { ok: false, error: "--limit requires a positive integer" };
      }
      limit = parsed;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      return {
        ok: false,
        error:
          "usage: diagnostics:cleanup [--workspace <id>] [--limit <n>] [--dry-run|--apply]",
      };
    } else {
      return { ok: false, error: `unknown argument: ${arg}` };
    }
  }
  return { ok: true, plan: { dryRun, workspaceId, limit } };
}
