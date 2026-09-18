import "server-only";

import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { getCreativeWorkSelectionPolicy } from "../../lib/creative-work-selection-policy";
import { db } from "../db";
import { diagnosticEvents } from "../db/schema";
import { getCreativeWork } from "../repositories/creative-work";
import {
  CONTENT_ACCESS_AUDIT_ACTION,
  recordContentAccessAudit,
} from "./content-access";
import {
  DIAGNOSTIC_CONTENT_POLICY_VERSION,
  DIAGNOSTIC_RETENTION_WINDOWS,
  resolveContentPolicy,
  type ContentPolicyDeps,
} from "./content-policy";
import {
  isContentExpired,
  sanitizeDiagnosticContent,
  type SanitizedDiagnosticContent,
} from "./content-sanitize";
import {
  DIAGNOSTIC_JOURNAL_DEFAULT_LIMIT,
  DIAGNOSTIC_JOURNAL_MAX_LIMIT,
  DiagnosticJournalError,
  listDiagnosticEvents,
  toEnvelope,
  type DiagnosticDatabase,
} from "./journal";
import {
  isDiagnosticStage,
  type ContentAvailabilityState,
  type DiagnosticContentMode,
  type DiagnosticEventEnvelope,
  type DiagnosticExternalRefs,
  type GetDiagnosticCall,
  type GetDiagnosticCallInput,
  type GetWorkDiagnostics,
  type GetWorkDiagnosticsInput,
  type ListDiagnosticEvents,
} from "./contract";

/**
 * Read-only diagnostics API (jhowtkd/adscale#392).
 *
 * Three projections for the Dono da plataforma, served by GET routes under
 * the existing feedback tree — list/search Trabalhos, one Trabalho's
 * diagnostic detail, one model call's allowed projection. Canonical state
 * comes from ADScale, journal events from the index; the two are composed
 * in parallel and every section carries its update time and origin.
 *
 * Hard rules (from spec #382):
 * - Platform-owner guard on the server; the UI guard is navigation-only.
 * - Trabalho→workspace→Peça/call association validated server-side.
 *   Inconsistent associations return no content — never an error that
 *   confirms a guess.
 * - Index failure never hides the Trabalho: canonical state stays visible
 *   with the telemetry section marked unavailable.
 * - Call detail resolves the call from the server-side index/scope before
 *   any Langfuse read. The client never supplies vendor URL/project.
 *   Langfuse down, rate-limited or gone becomes an availability state,
 *   never a console 500.
 * - Content reads are audited (operator, scope, time, resource, purpose —
 *   never the prompt). Audit-write failure denies content; safe metadata
 *   is still returned.
 * - No replay, no generation/approve/retry action, no financial metrics,
 *   no arbitrary query editor. Responses are private and never cached
 *   shared (`Cache-Control: private, no-store`, applied by the routes).
 * - Error responses carry codes, never secrets or raw internals.
 *
 * Journal envelopes are served verbatim as evidence: per-event stored
 * content refs are NOT rewritten when retention lapses. The call detail
 * (audited read) is authoritative for effective content availability.
 */

export const DIAGNOSTIC_API_CACHE_CONTROL = "private, no-store";

/** Attach the private/no-store header to a diagnostics response. */
export function withDiagnosticApiCacheHeaders<T extends { headers: Headers }>(
  response: T,
): T {
  response.headers.set("Cache-Control", DIAGNOSTIC_API_CACHE_CONTROL);
  return response;
}

export type DiagnosticApiErrorCode =
  | "INVALID_SCOPE"
  | "INVALID_CURSOR"
  | "INVALID_LIMIT"
  | "INVALID_FILTER"
  | "INVALID_READ_REQUEST";

/** Typed read-path failure. Routes map every code to a 400. */
export class DiagnosticApiError extends Error {
  readonly code: DiagnosticApiErrorCode;

  constructor(code: DiagnosticApiErrorCode, message: string) {
    super(message);
    this.name = "DiagnosticApiError";
    this.code = code;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DIAGNOSTIC_JOURNAL_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1) {
    throw new DiagnosticApiError(
      "INVALID_LIMIT",
      "diagnostics: limit must be a positive integer",
    );
  }
  return Math.min(limit, DIAGNOSTIC_JOURNAL_MAX_LIMIT);
}

// ---------------------------------------------------------------------------
// Works listing (list/search)
// ---------------------------------------------------------------------------

export const DIAGNOSTIC_WORKS_SORTS = ["recent", "oldest"] as const;

export type DiagnosticWorksSort = (typeof DIAGNOSTIC_WORKS_SORTS)[number];

export function isDiagnosticWorksSort(
  value: unknown,
): value is DiagnosticWorksSort {
  return value === "recent" || value === "oldest";
}

/**
 * Per-work outcome states. `failed`/`completed`/`unconfirmed` are mutually
 * exclusive by precedence (failed > completed > unconfirmed); `partial`
 * (incomplete telemetry) is orthogonal and travels alongside.
 */
export const DIAGNOSTIC_WORK_STATES = [
  "failed",
  "completed",
  "unconfirmed",
  "partial",
] as const;

export type DiagnosticWorkState = (typeof DIAGNOSTIC_WORK_STATES)[number];

export function isDiagnosticWorkState(
  value: unknown,
): value is DiagnosticWorkState {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_WORK_STATES as readonly string[]).includes(value)
  );
}

export interface ListDiagnosticWorksInput {
  workspaceId?: string;
  workItemId?: string;
  from?: string;
  to?: string;
  stage?: string;
  provider?: string;
  model?: string;
  state?: string;
  sort?: string;
  cursor?: string;
  limit?: number;
}

export interface DiagnosticWorkSummary {
  workspaceId: string;
  workItemId: string;
  firstSeen: string;
  lastSeen: string;
  eventCount: number;
  states: DiagnosticWorkState[];
}

export interface ListDiagnosticWorksResult {
  works: DiagnosticWorkSummary[];
  nextCursor: string | null;
}

interface WorksCursorPosition {
  lastSeen: string;
  workspaceId: string;
  workItemId: string;
  sort: DiagnosticWorksSort;
}

export function encodeWorksCursor(position: WorksCursorPosition): string {
  return Buffer.from(
    JSON.stringify([
      position.lastSeen,
      position.workspaceId,
      position.workItemId,
      position.sort,
    ]),
    "utf8",
  ).toString("base64url");
}

export function decodeWorksCursor(
  cursor: string,
  sort: DiagnosticWorksSort,
): WorksCursorPosition {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(parsed) &&
      parsed.length === 4 &&
      typeof parsed[0] === "string" &&
      !Number.isNaN(Date.parse(parsed[0])) &&
      isNonEmptyString(parsed[1]) &&
      isNonEmptyString(parsed[2]) &&
      parsed[3] === sort
    ) {
      return {
        lastSeen: parsed[0],
        workspaceId: parsed[1],
        workItemId: parsed[2],
        sort,
      };
    }
  } catch {
    // Fall through to the typed error below.
  }
  throw new DiagnosticApiError(
    "INVALID_CURSOR",
    "diagnostics: cursor is not a valid works-list cursor",
  );
}

function parseWorksListInput(input: ListDiagnosticWorksInput): {
  workspaceId: string | undefined;
  workItemId: string | undefined;
  from: Date | undefined;
  to: Date | undefined;
  stage: string | undefined;
  provider: string | undefined;
  model: string | undefined;
  state: DiagnosticWorkState | undefined;
  sort: DiagnosticWorksSort;
  limit: number;
} {
  const text = (value: unknown, max: number): string | undefined => {
    if (value === undefined) return undefined;
    if (!isNonEmptyString(value) || value.length > max) {
      throw new DiagnosticApiError(
        "INVALID_FILTER",
        "diagnostics: filter must be a non-empty string within bounds",
      );
    }
    return value;
  };
  const instant = (value: unknown): Date | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
      throw new DiagnosticApiError(
        "INVALID_FILTER",
        "diagnostics: period bounds must be ISO datetimes",
      );
    }
    return new Date(value);
  };
  const stage = text(input?.stage, 64);
  if (stage !== undefined && !isDiagnosticStage(stage)) {
    throw new DiagnosticApiError(
      "INVALID_FILTER",
      "diagnostics: stage is not a known diagnostic stage",
    );
  }
  const state = text(input?.state, 32);
  if (state !== undefined && !isDiagnosticWorkState(state)) {
    throw new DiagnosticApiError(
      "INVALID_FILTER",
      "diagnostics: state is not a known work state",
    );
  }
  const sortRaw = input?.sort === undefined ? "recent" : input.sort;
  if (!isDiagnosticWorksSort(sortRaw)) {
    throw new DiagnosticApiError(
      "INVALID_FILTER",
      "diagnostics: sort must be one of the allowed values",
    );
  }
  const from = instant(input?.from);
  const to = instant(input?.to);
  if (from && to && from.getTime() > to.getTime()) {
    throw new DiagnosticApiError(
      "INVALID_FILTER",
      "diagnostics: period start must not be after period end",
    );
  }
  return {
    workspaceId: text(input?.workspaceId, 200),
    workItemId: text(input?.workItemId, 200),
    from,
    to,
    stage,
    provider: text(input?.provider, 200),
    model: text(input?.model, 200),
    state,
    sort: sortRaw,
    limit: normalizeLimit(input?.limit),
  };
}

/** Classify one work from its journal aggregates. Pure and total. */
export function classifyWorkStates(input: {
  failed: boolean;
  completed: boolean;
  partial: boolean;
}): DiagnosticWorkState[] {
  const states: DiagnosticWorkState[] = [
    input.failed ? "failed" : input.completed ? "completed" : "unconfirmed",
  ];
  if (input.partial) states.push("partial");
  return states;
}

export interface DiagnosticsApiDeps {
  database?: DiagnosticDatabase;
  policyDeps?: ContentPolicyDeps;
  now?: Date;
}

/**
 * List distinct Trabalhos observed in the journal index. Row-level filters
 * (workspace, exact work, period, stage, provider/model) match a work when
 * ANY of its events match; the state filter matches the classified work.
 * Cursor pagination over (lastSeen, workspaceId, workItemId); newest first
 * by default (`recent`), oldest first with `oldest`.
 */
export async function listDiagnosticWorks(
  input: ListDiagnosticWorksInput,
  deps: DiagnosticsApiDeps = {},
): Promise<ListDiagnosticWorksResult> {
  const parsed = parseWorksListInput(input);
  const database = deps.database ?? db;
  const position =
    input?.cursor === undefined
      ? null
      : decodeWorksCursor(input.cursor, parsed.sort);

  const perWork = database
    .select({
      workspaceId: diagnosticEvents.workspaceId,
      workItemId: diagnosticEvents.workItemId,
      firstSeen: sql<Date>`min(${diagnosticEvents.occurredAt})`.as("first_seen"),
      lastSeen: sql<Date>`max(${diagnosticEvents.occurredAt})`.as("last_seen"),
      eventCount: sql<number>`count(*)::int`.as("event_count"),
      failed: sql<boolean>`bool_or(${diagnosticEvents.event} in ('operation.failed','stage.failed','model.call.failed','model.validation.failed','selection.effect.failed'))`.as("failed"),
      completed: sql<boolean>`bool_or(${diagnosticEvents.event} = 'operation.completed')`.as("completed"),
      partial: sql<boolean>`bool_or(${diagnosticEvents.correlation} = 'partial')`.as("partial"),
    })
    .from(diagnosticEvents)
    .where(
      and(
        parsed.workspaceId
          ? eq(diagnosticEvents.workspaceId, parsed.workspaceId)
          : undefined,
        parsed.workItemId
          ? eq(diagnosticEvents.workItemId, parsed.workItemId)
          : undefined,
        parsed.from
          ? gte(diagnosticEvents.occurredAt, parsed.from)
          : undefined,
        parsed.to ? lte(diagnosticEvents.occurredAt, parsed.to) : undefined,
        parsed.stage ? eq(diagnosticEvents.stage, parsed.stage) : undefined,
        parsed.provider
          ? eq(diagnosticEvents.provider, parsed.provider)
          : undefined,
        parsed.model
          ? eq(diagnosticEvents.requestedModel, parsed.model)
          : undefined,
      ),
    )
    .groupBy(diagnosticEvents.workspaceId, diagnosticEvents.workItemId)
    .as("diagnostic_works");

  const recentFirst = parsed.sort === "recent";
  const cursorFilter = position
    ? recentFirst
      ? sql`("last_seen", "workspace_id", "work_item_id") < (${position.lastSeen}, ${position.workspaceId}, ${position.workItemId})`
      : sql`("last_seen", "workspace_id", "work_item_id") > (${position.lastSeen}, ${position.workspaceId}, ${position.workItemId})`
    : undefined;
  const stateFilter =
    parsed.state === undefined
      ? undefined
      : parsed.state === "failed"
        ? eq(perWork.failed, true)
        : parsed.state === "completed"
          ? and(eq(perWork.completed, true), eq(perWork.failed, false))
          : parsed.state === "unconfirmed"
            ? and(eq(perWork.completed, false), eq(perWork.failed, false))
            : eq(perWork.partial, true);

  const rows = await database
    .select()
    .from(perWork)
    .where(and(cursorFilter, stateFilter))
    .orderBy(
      recentFirst
        ? desc(perWork.lastSeen)
        : asc(perWork.lastSeen),
      recentFirst
        ? desc(perWork.workspaceId)
        : asc(perWork.workspaceId),
      recentFirst
        ? desc(perWork.workItemId)
        : asc(perWork.workItemId),
    )
    .limit(parsed.limit + 1);

  const page = rows.slice(0, parsed.limit);
  // Aggregate expressions travel as text through the driver, bypassing the
  // timestamp→Date mapping (which reads UTC). Stored walls are UTC —
  // drizzle writes instants as UTC ISO and Postgres keeps timestamp
  // columns literally — so coerce text as UTC, never as process-local
  // time. Keeps payloads and cursors correct in any timezone.
  const toInstant = (value: Date | string): Date => {
    if (value instanceof Date) return value;
    const text = value.includes("T") ? value : value.replace(" ", "T");
    return /([Zz]|[+-]\d{2}:?\d{2})$/.test(text)
      ? new Date(text)
      : new Date(`${text}Z`);
  };
  const toIso = (value: Date | string): string =>
    toInstant(value).toISOString();
  const works = page.map((row) => ({
    workspaceId: row.workspaceId,
    workItemId: row.workItemId,
    firstSeen: toIso(row.firstSeen as Date | string),
    lastSeen: toIso(row.lastSeen as Date | string),
    eventCount: row.eventCount,
    states: classifyWorkStates({
      failed: row.failed,
      completed: row.completed,
      partial: row.partial,
    }),
  }));
  const last = page[page.length - 1];
  return {
    works,
    nextCursor:
      rows.length > parsed.limit && last
        ? encodeWorksCursor({
            lastSeen: toIso(last.lastSeen as Date | string),
            workspaceId: last.workspaceId,
            workItemId: last.workItemId,
            sort: parsed.sort,
          })
        : null,
  };
}

// ---------------------------------------------------------------------------
// Private deep-links (server-side templates only)
// ---------------------------------------------------------------------------

export type DiagnosticLinkDestination = "sentry" | "inngest" | "langfuse";

export type DiagnosticLinkAvailability =
  | "configured"
  | "unconfigured"
  | "misconfigured"
  | "no_ref";

export interface DiagnosticLink {
  destination: DiagnosticLinkDestination;
  /** Null unless availability is `configured`. Never carries credentials. */
  url: string | null;
  availability: DiagnosticLinkAvailability;
}

export interface DiagnosticLinkRefs {
  sentryEventId?: string | null;
  inngestRunId?: string | null;
  langfuseTraceId?: string | null;
}

const LINK_TEMPLATES: {
  destination: DiagnosticLinkDestination;
  envVar: string;
  placeholder: string;
  ref: keyof DiagnosticLinkRefs;
}[] = [
  {
    destination: "sentry",
    envVar: "DIAGNOSTICS_SENTRY_EVENT_URL_TEMPLATE",
    placeholder: "{eventId}",
    ref: "sentryEventId",
  },
  {
    destination: "inngest",
    envVar: "DIAGNOSTICS_INNGEST_RUN_URL_TEMPLATE",
    placeholder: "{runId}",
    ref: "inngestRunId",
  },
  {
    destination: "langfuse",
    envVar: "DIAGNOSTICS_LANGFUSE_TRACE_URL_TEMPLATE",
    placeholder: "{traceId}",
    ref: "langfuseTraceId",
  },
];

/**
 * Build private vendor deep-links from server-side URL templates. The
 * client never supplies vendor URLs: each template lives in server env and
 * carries one `{id}` placeholder. Templates with credentials, non-http(s)
 * schemes or a missing placeholder are misconfigured — the link is
 * withheld, never built half-valid. Pure and total; never throws.
 */
export function buildDiagnosticLinks(
  refs: DiagnosticLinkRefs,
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticLink[] {
  return LINK_TEMPLATES.map((spec) => {
    const ref = refs?.[spec.ref] ?? null;
    if (!isNonEmptyString(ref)) {
      return {
        destination: spec.destination,
        url: null,
        availability: "no_ref",
      };
    }
    let template: string | undefined;
    try {
      template = env?.[spec.envVar];
    } catch {
      template = undefined;
    }
    if (template === undefined || template.trim().length === 0) {
      return {
        destination: spec.destination,
        url: null,
        availability: "unconfigured",
      };
    }
    try {
      if (!template.includes(spec.placeholder)) {
        return {
          destination: spec.destination,
          url: null,
          availability: "misconfigured",
        };
      }
      const url = new URL(
        template.replaceAll(spec.placeholder, encodeURIComponent(ref)),
      );
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return {
          destination: spec.destination,
          url: null,
          availability: "misconfigured",
        };
      }
      if (url.username.length > 0 || url.password.length > 0) {
        return {
          destination: spec.destination,
          url: null,
          availability: "misconfigured",
        };
      }
      return {
        destination: spec.destination,
        url: url.toString(),
        availability: "configured",
      };
    } catch {
      return {
        destination: spec.destination,
        url: null,
        availability: "misconfigured",
      };
    }
  });
}

// ---------------------------------------------------------------------------
// Server-side Langfuse trace read (redacted disclosure only)
// ---------------------------------------------------------------------------

/** Fallback Langfuse endpoint when LANGFUSE_BASE_URL is unset (mirrors the OTel exporter default). */
const LANGFUSE_DEFAULT_BASE_URL = "https://cloud.langfuse.com";

/** Per-request timeout for the remote trace read. */
export const DIAGNOSTIC_REMOTE_TRACE_TIMEOUT_MS = 5_000;

export type RemoteTraceReadStatus = "present" | "unavailable";

export interface RemoteTraceRead {
  status: RemoteTraceReadStatus;
  /** Candidate content for sanitization. Present only on `present`. */
  content?: unknown;
}

export interface RemoteTraceReadDeps {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function resolveLangfuseReadConfig(env: NodeJS.ProcessEnv): {
  baseUrl: string;
  auth: string;
} | null {
  try {
    const publicKey = env?.LANGFUSE_PUBLIC_KEY?.trim() ?? "";
    const secretKey = env?.LANGFUSE_SECRET_KEY?.trim() ?? "";
    if (publicKey.length === 0 || secretKey.length === 0) return null;
    const raw = (env?.LANGFUSE_BASE_URL ?? "").trim();
    const candidate =
      raw.length === 0 ? LANGFUSE_DEFAULT_BASE_URL : raw;
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return {
      baseUrl: candidate.replace(/\/+$/, ""),
      auth: `Basic ${Buffer.from(`${publicKey}:${secretKey}`, "utf8").toString("base64")}`,
    };
  } catch {
    return null;
  }
}

function extractTraceContent(
  body: unknown,
  observationId: string | null,
): unknown {
  if (body === null || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  const observations = record["observations"];
  if (
    observationId &&
    Array.isArray(observations)
  ) {
    const match = observations.find(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>)["id"] === observationId,
    ) as Record<string, unknown> | undefined;
    if (match) {
      const input = match["input"] ?? null;
      const output = match["output"] ?? null;
      if (input === null && output === null) return undefined;
      return { input, output };
    }
  }
  const input = record["input"] ?? null;
  const output = record["output"] ?? null;
  if (input === null && output === null) return undefined;
  return { input, output };
}

/**
 * Read one trace through the Langfuse public API, server-side only: base
 * URL and credentials come from server env, the trace id from the journal
 * index — never from the client. Every failure mode (missing config,
 * network error, timeout, 401/429/5xx, missing trace, unparseable body)
 * maps to `unavailable`. Never throws, never retries, never logs secrets.
 */
export async function readRemoteTrace(
  traceId: string,
  observationId: string | null,
  deps: RemoteTraceReadDeps = {},
): Promise<RemoteTraceRead> {
  try {
    if (!isNonEmptyString(traceId)) return { status: "unavailable" };
    const env = deps.env ?? process.env;
    const config = resolveLangfuseReadConfig(env);
    if (!config) return { status: "unavailable" };
    const fetchImpl = deps.fetchImpl ?? fetch;
    const timeoutMs =
      typeof deps.timeoutMs === "number" && deps.timeoutMs > 0
        ? deps.timeoutMs
        : DIAGNOSTIC_REMOTE_TRACE_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (
        typeof timer === "object" &&
        typeof (timer as { unref?: unknown }).unref === "function"
      ) {
        (timer as unknown as { unref: () => void }).unref();
      }
      const response = await fetchImpl(
        `${config.baseUrl}/api/public/traces/${encodeURIComponent(traceId)}`,
        {
          method: "GET",
          headers: { authorization: config.auth },
          signal: controller.signal,
        },
      );
      if (!response.ok) return { status: "unavailable" };
      const body: unknown = await response.json();
      const content = extractTraceContent(body, observationId);
      if (content === undefined) return { status: "unavailable" };
      return { status: "present", content };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { status: "unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Trabalho detail (canonical state + journal, composed in parallel)
// ---------------------------------------------------------------------------

export interface DiagnosticWorkOutputProjection {
  id: string;
  status: string;
  targetFormat: string;
  versionNumber: number;
  isSelected: boolean;
  selectedBy: "operator" | "agent" | null;
  failureCode: string | null;
  deliverable: boolean;
  selectable: boolean;
  selectionConfirmationRequired: boolean;
  qualityPresent: boolean;
  createdAt: string;
  updatedAt: string;
  terminalAt: string | null;
}

export interface DiagnosticWorkProjection {
  origin: "canonical";
  updatedAt: string;
  workspaceId: string;
  workItemId: string;
  clientProfileId: string | null;
  toolKind: string | null;
  status: string | null;
  title: string;
  briefPresent: boolean;
  requestPresent: boolean;
  createdAt: string;
  outputs: DiagnosticWorkOutputProjection[];
  selection: {
    selectedOutputId: string | null;
    selectedBy: "operator" | "agent" | null;
    updatedAt: string;
  };
  /**
   * Canonical delivery state. Downloads/exports persist no canonical
   * record — delivery truth lives in the journal's export events, linked
   * below under telemetry. Reported explicitly so absence is visible.
   */
  delivery: {
    origin: "canonical";
    recorded: false;
  };
}

export interface DiagnosticTelemetryProjection {
  origin: "journal";
  status: "ok" | "unavailable";
  /** Max recordedAt of the returned events; null when empty/unavailable. */
  updatedAt: string | null;
  partial: boolean;
  operationIds: string[];
  events: DiagnosticEventEnvelope[];
  nextCursor: string | null;
}

export interface WorkDiagnosticsResult {
  found: true;
  work: DiagnosticWorkProjection;
  telemetry: DiagnosticTelemetryProjection;
  links: {
    origin: "server-config";
    items: DiagnosticLink[];
  };
}

export type GetWorkDiagnosticsResult =
  | WorkDiagnosticsResult
  | { found: false };

export interface WorkDiagnosticsDeps extends DiagnosticsApiDeps {
  listEvents?: ListDiagnosticEvents;
}

function validateWorkScope(
  workspaceId: unknown,
  workItemId: unknown,
): void {
  if (!isNonEmptyString(workspaceId) || !isNonEmptyString(workItemId)) {
    throw new DiagnosticApiError(
      "INVALID_SCOPE",
      "diagnostics: workspaceId and workItemId are required",
    );
  }
}

async function fetchCanonicalWork(
  database: DiagnosticDatabase,
  workspaceId: string,
  workItemId: string,
): Promise<DiagnosticWorkProjection | null> {
  const found = await getCreativeWork(workspaceId, workItemId, database);
  if (!found) return null;
  const outputs: DiagnosticWorkOutputProjection[] = found.outputs.map(
    (output) => {
      const policy = getCreativeWorkSelectionPolicy(
        output.quality,
        output.id,
      );
      return {
        id: output.id,
        status: output.status,
        targetFormat: output.targetFormat,
        versionNumber: output.versionNumber,
        isSelected: output.isSelected,
        selectedBy: output.selectedBy,
        failureCode: output.failureCode,
        deliverable:
          output.status === "completed" && output.outputKey !== null,
        selectable: policy.selectable,
        selectionConfirmationRequired: policy.requiresConfirmation,
        qualityPresent: output.quality !== null,
        createdAt: output.createdAt.toISOString(),
        updatedAt: output.updatedAt.toISOString(),
        terminalAt: output.terminalAt ? output.terminalAt.toISOString() : null,
      };
    },
  );
  const selected = found.outputs.find((output) => output.isSelected) ?? null;
  return {
    origin: "canonical",
    updatedAt: found.work.updatedAt.toISOString(),
    workspaceId: found.work.workspaceId,
    workItemId: found.work.id,
    clientProfileId: found.work.clientProfileId,
    toolKind: found.work.toolKind,
    status: found.work.status,
    title: found.work.title,
    briefPresent: found.work.brief !== null,
    requestPresent: found.work.request.trim().length > 0,
    createdAt: found.work.createdAt.toISOString(),
    outputs,
    selection: {
      selectedOutputId: selected ? selected.id : null,
      selectedBy: selected ? selected.selectedBy : null,
      updatedAt: (selected ?? found.work).updatedAt.toISOString(),
    },
    delivery: { origin: "canonical", recorded: false },
  };
}

/**
 * Pure composition of canonical state with a settled telemetry read.
 * A rejected/failed index read degrades the telemetry section — it never
 * hides the Trabalho.
 */
export function composeWorkDiagnostics(
  work: DiagnosticWorkProjection,
  telemetry:
    | { status: "ok"; events: DiagnosticEventEnvelope[]; nextCursor: string | null }
    | { status: "unavailable" },
  links: DiagnosticLink[],
): WorkDiagnosticsResult {
  if (telemetry.status === "unavailable") {
    return {
      found: true,
      work,
      telemetry: {
        origin: "journal",
        status: "unavailable",
        updatedAt: null,
        partial: true,
        operationIds: [],
        events: [],
        nextCursor: null,
      },
      links: { origin: "server-config", items: links },
    };
  }
  const operationIds: string[] = [];
  const seen = new Set<string>();
  let maxRecordedAt: string | null = null;
  let partial = false;
  for (const event of telemetry.events) {
    if (event.correlation === "partial") partial = true;
    const operationId = event.context?.operationId;
    if (operationId && !seen.has(operationId)) {
      seen.add(operationId);
      operationIds.push(operationId);
    }
    if (maxRecordedAt === null || event.recordedAt > maxRecordedAt) {
      maxRecordedAt = event.recordedAt;
    }
  }
  return {
    found: true,
    work,
    telemetry: {
      origin: "journal",
      status: "ok",
      updatedAt: maxRecordedAt,
      partial,
      operationIds,
      events: telemetry.events,
      nextCursor: telemetry.nextCursor,
    },
    links: { origin: "server-config", items: links },
  };
}

function collectWorkLinkRefs(
  events: DiagnosticEventEnvelope[],
): DiagnosticLinkRefs {
  const refs: DiagnosticLinkRefs = {};
  for (const event of events) {
    const external = event.externalRefs;
    if (!external) continue;
    if (!refs.sentryEventId && external.sentryEventId) {
      refs.sentryEventId = external.sentryEventId;
    }
    if (!refs.inngestRunId && external.inngestRunId) {
      refs.inngestRunId = external.inngestRunId;
    }
    if (!refs.langfuseTraceId && external.langfuseTraceId) {
      refs.langfuseTraceId = external.langfuseTraceId;
    }
  }
  return refs;
}

export const getWorkDiagnostics: GetWorkDiagnostics = async (
  input: GetWorkDiagnosticsInput,
  deps: WorkDiagnosticsDeps = {},
): Promise<unknown> => {
  validateWorkScope(input?.workspaceId, input?.workItemId);
  const database = deps.database ?? db;
  const listEvents = deps.listEvents ?? listDiagnosticEvents;
  const limit = normalizeLimit(input?.limit);
  if (input?.cursor !== undefined && !isNonEmptyString(input.cursor)) {
    throw new DiagnosticApiError(
      "INVALID_CURSOR",
      "diagnostics: cursor must be a non-empty string",
    );
  }

  const [canonical, telemetry] = await Promise.all([
    fetchCanonicalWork(database, input.workspaceId, input.workItemId),
    listEvents({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      cursor: input.cursor,
      limit,
    }).then(
      (page) =>
        ({ status: "ok" as const, ...page }),
      (error: unknown) => {
        if (error instanceof DiagnosticJournalError) throw error;
        return { status: "unavailable" as const };
      },
    ),
  ]);
  if (!canonical) return { found: false } satisfies { found: false };
  const events = telemetry.status === "ok" ? telemetry.events : [];
  const links = buildDiagnosticLinks(collectWorkLinkRefs(events));
  return composeWorkDiagnostics(
    canonical,
    telemetry,
    links,
  ) satisfies WorkDiagnosticsResult;
};

// ---------------------------------------------------------------------------
// Call detail (server-side index/scope resolution + audited content read)
// ---------------------------------------------------------------------------

/** Maximum events resolved for one call (started/completed/failed/validation). */
export const DIAGNOSTIC_CALL_EVENTS_MAX = 200;

/** Audit scope for console content reads. */
export const DIAGNOSTIC_CONTENT_READ_SCOPE = "platform-owner";

/** Maximum recorded purpose length for a content read. */
export const DIAGNOSTIC_CONTENT_REASON_MAX_LENGTH = 500;

export type DiagnosticCallStatus = "completed" | "failed" | "unconfirmed";

export interface DiagnosticCallProjection {
  origin: "journal";
  updatedAt: string;
  callId: string;
  provider: string;
  requestedModel: string;
  returnedModel: string | null;
  providerRequestId: string | null;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  stage: string | null;
  operationId: string;
  occurredAt: string;
  status: DiagnosticCallStatus;
  /** Independent of transport status: answered transport + failed validation. */
  validationFailed: boolean;
  /** Stored content ref, verbatim journal evidence (see module header). */
  contentRecorded: {
    availability: ContentAvailabilityState;
    policyVersion: string;
  } | null;
  events: DiagnosticEventEnvelope[];
}

export interface DiagnosticCallContentProjection {
  allowed: boolean;
  availability: ContentAvailabilityState;
  policyVersion: string;
  verbatim?: false;
  notice?: string;
  truncated?: boolean;
  /** Non-verbatim payload. Present only on an allowed disclosure. */
  payload?: unknown;
  auditId: string | null;
}

export interface DiagnosticCallResult {
  found: true;
  call: DiagnosticCallProjection;
  content: DiagnosticCallContentProjection;
  externalRefs: DiagnosticExternalRefs;
  links: {
    origin: "server-config";
    items: DiagnosticLink[];
  };
}

export type GetDiagnosticCallResult = DiagnosticCallResult | { found: false };

export interface DiagnosticCallDeps extends DiagnosticsApiDeps {
  listCallEvents?: (
    input: { workspaceId: string; workItemId: string; callId: string },
  ) => Promise<DiagnosticEventEnvelope[]>;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  retentionDays?: number;
  timeoutMs?: number;
}

/**
 * Resolve one call's events from the journal index, scoped by
 * workspace + work + call. Bounded; oldest first.
 */
export async function listDiagnosticCallEvents(
  input: { workspaceId: string; workItemId: string; callId: string },
  database: DiagnosticDatabase = db,
): Promise<DiagnosticEventEnvelope[]> {
  const rows = await database
    .select()
    .from(diagnosticEvents)
    .where(
      and(
        eq(diagnosticEvents.workspaceId, input.workspaceId),
        eq(diagnosticEvents.workItemId, input.workItemId),
        eq(diagnosticEvents.callId, input.callId),
      ),
    )
    .orderBy(asc(diagnosticEvents.occurredAt), asc(diagnosticEvents.id))
    .limit(DIAGNOSTIC_CALL_EVENTS_MAX);
  return rows.map(toEnvelope);
}

function validateCallInput(input: GetDiagnosticCallInput): void {
  validateWorkScope(input?.workspaceId, input?.workItemId);
  if (!isNonEmptyString(input?.callId)) {
    throw new DiagnosticApiError(
      "INVALID_SCOPE",
      "diagnostics: callId is required",
    );
  }
  if (!isNonEmptyString(input?.actorId) || input.actorId.length > 200) {
    throw new DiagnosticApiError(
      "INVALID_READ_REQUEST",
      "diagnostics: actorId is required",
    );
  }
  const reason = input?.reason;
  if (
    !isNonEmptyString(reason) ||
    reason.length > DIAGNOSTIC_CONTENT_REASON_MAX_LENGTH
  ) {
    throw new DiagnosticApiError(
      "INVALID_READ_REQUEST",
      "diagnostics: reason is required",
    );
  }
}

/**
 * Pure composition of a call's journal events into facts. Latest reported
 * facts win; usage/request ids appear only when actually returned; the
 * terminal status follows the latest terminal event by occurrence.
 */
export function composeCallProjection(
  callId: string,
  events: DiagnosticEventEnvelope[],
): DiagnosticCallProjection | null {
  const withCall = events.filter((event) => event.call?.callId === callId);
  if (withCall.length === 0) return null;
  const first = withCall[0];
  let provider = "";
  let requestedModel = "";
  let returnedModel: string | null = null;
  let providerRequestId: string | null = null;
  let latencyMs: number | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let stage: string | null = null;
  let contentRecorded: DiagnosticCallProjection["contentRecorded"] = null;
  let maxRecordedAt = first.recordedAt;
  let completedAt: string | null = null;
  let failedAt: string | null = null;
  let validationFailed = false;
  for (const event of withCall) {
    const call = event.call;
    if (call) {
      provider = call.provider;
      requestedModel = call.requestedModel;
      if (call.returnedModel !== null) returnedModel = call.returnedModel;
      if (call.providerRequestId !== null) {
        providerRequestId = call.providerRequestId;
      }
      if (call.latencyMs !== undefined) latencyMs = call.latencyMs;
      if (call.inputTokens !== undefined) inputTokens = call.inputTokens;
      if (call.outputTokens !== undefined) outputTokens = call.outputTokens;
    }
    if (event.stage) stage = event.stage;
    if (event.content) contentRecorded = { ...event.content };
    if (event.recordedAt > maxRecordedAt) maxRecordedAt = event.recordedAt;
    if (event.event === "model.call.completed") completedAt = event.occurredAt;
    if (event.event === "model.call.failed") failedAt = event.occurredAt;
    if (event.event === "model.validation.failed") validationFailed = true;
  }
  const status: DiagnosticCallStatus =
    failedAt !== null && (completedAt === null || failedAt > completedAt)
      ? "failed"
      : completedAt !== null
        ? "completed"
        : "unconfirmed";
  const projection: DiagnosticCallProjection = {
    origin: "journal",
    updatedAt: maxRecordedAt,
    callId,
    provider,
    requestedModel,
    returnedModel,
    providerRequestId,
    stage,
    operationId: first.context?.operationId ?? "",
    occurredAt: first.occurredAt,
    status,
    validationFailed,
    contentRecorded,
    events: withCall,
  };
  if (latencyMs !== undefined) projection.latencyMs = latencyMs;
  if (inputTokens !== undefined) projection.inputTokens = inputTokens;
  if (outputTokens !== undefined) projection.outputTokens = outputTokens;
  return projection;
}

function mergeExternalRefs(
  events: DiagnosticEventEnvelope[],
): DiagnosticExternalRefs {
  const refs: DiagnosticExternalRefs = {};
  for (const event of events) {
    const external = event.externalRefs;
    if (!external) continue;
    if (!refs.sentryEventId && external.sentryEventId) {
      refs.sentryEventId = external.sentryEventId;
    }
    if (!refs.inngestRunId && external.inngestRunId) {
      refs.inngestRunId = external.inngestRunId;
    }
    if (!refs.langfuseTraceId && external.langfuseTraceId) {
      refs.langfuseTraceId = external.langfuseTraceId;
    }
    if (!refs.langfuseObservationId && external.langfuseObservationId) {
      refs.langfuseObservationId = external.langfuseObservationId;
    }
  }
  return refs;
}

export const getDiagnosticCall: GetDiagnosticCall = async (
  input: GetDiagnosticCallInput,
  deps: DiagnosticCallDeps = {},
): Promise<unknown> => {
  validateCallInput(input);
  const database = deps.database ?? db;
  const env = deps.env ?? process.env;
  const now = deps.now instanceof Date ? deps.now : new Date();
  const retentionDays =
    typeof deps.retentionDays === "number"
      ? deps.retentionDays
      : DIAGNOSTIC_RETENTION_WINDOWS.aiTracesDays;

  // Server-side index/scope resolution first: canonical association, then
  // the call's events within the same scope. Anything inconsistent yields
  // no content — the same response as a call that never existed.
  const canonical = await fetchCanonicalWork(
    database,
    input.workspaceId,
    input.workItemId,
  );
  if (!canonical) return { found: false } satisfies { found: false };
  const listCallEvents = deps.listCallEvents ?? listDiagnosticCallEvents;
  const events =
    deps.listCallEvents !== undefined
      ? await listCallEvents({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          callId: input.callId,
        })
      : await listDiagnosticCallEvents(
          {
            workspaceId: input.workspaceId,
            workItemId: input.workItemId,
            callId: input.callId,
          },
          database,
        );
  const call = composeCallProjection(input.callId, events);
  if (!call) return { found: false } satisfies { found: false };
  const callOutputId = events.find((event) => event.context?.outputId)?.context
    ?.outputId;
  if (
    callOutputId !== undefined &&
    !canonical.outputs.some((output) => output.id === callOutputId)
  ) {
    return { found: false } satisfies { found: false };
  }

  const expired = isContentExpired(call.occurredAt, now, retentionDays);
  const externalRefs = mergeExternalRefs(events);

  // The audit attempt is recorded before any disclosure. When the audit
  // write itself fails, content is denied and only safe metadata returns.
  let auditId: string;
  try {
    ({ id: auditId } = await recordContentAccessAudit(
      {
        operatorId: input.actorId,
        scope: DIAGNOSTIC_CONTENT_READ_SCOPE,
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        resource: `call:${input.callId}`,
        action: CONTENT_ACCESS_AUDIT_ACTION,
        reason: input.reason,
        result: "allowed",
      },
      database,
    ));
  } catch {
    return {
      found: true,
      call,
      content: {
        allowed: false,
        availability: expired ? "expired" : "not_collected",
        policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
        auditId: null,
      },
      externalRefs,
      links: {
        origin: "server-config",
        items: buildDiagnosticLinks(
          {
            sentryEventId: externalRefs.sentryEventId,
            inngestRunId: externalRefs.inngestRunId,
            langfuseTraceId: externalRefs.langfuseTraceId,
          },
          env,
        ),
      },
    } satisfies DiagnosticCallResult;
  }

  // Availability precedence (contract of resolveContentAvailability):
  // expired > not_collected > unavailable > truncated/redacted. A remote
  // read happens only when redacted disclosure could actually depend on
  // it: redacted mode, a stored trace id, and unexpired content.
  const mode: DiagnosticContentMode = await resolveContentPolicy(
    input.workspaceId,
    deps.policyDeps,
  ).catch(() => "metadata_only" as const);
  const traceId = externalRefs.langfuseTraceId ?? null;
  let availability: ContentAvailabilityState;
  let disclosed: SanitizedDiagnosticContent | null = null;
  if (expired) {
    availability = "expired";
  } else if (mode !== "redacted" || traceId === null) {
    availability = "not_collected";
  } else {
    const remote = await readRemoteTrace(traceId, externalRefs.langfuseObservationId ?? null, {
      env,
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.timeoutMs,
    });
    if (remote.status === "unavailable" || remote.content === undefined) {
      availability = "unavailable";
    } else {
      const sanitized = sanitizeDiagnosticContent(remote.content);
      if (!sanitized) {
        availability = "unavailable";
      } else {
        disclosed = sanitized;
        availability = sanitized.availability;
      }
    }
  }

  return {
    found: true,
    call,
    content: {
      allowed: true,
      availability,
      policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
      ...(disclosed
        ? {
            verbatim: disclosed.verbatim,
            notice: disclosed.notice,
            truncated: disclosed.truncated,
            payload: disclosed.payload,
          }
        : {}),
      auditId,
    },
    externalRefs,
    links: {
      origin: "server-config",
      items: buildDiagnosticLinks(
        {
          sentryEventId: externalRefs.sentryEventId,
          inngestRunId: externalRefs.inngestRunId,
          langfuseTraceId: externalRefs.langfuseTraceId,
        },
        env,
      ),
    },
  } satisfies DiagnosticCallResult;
};
