import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  type DiagnosticContext,
  type DiagnosticDataOrigin,
  type DiagnosticProcess,
  type GetDiagnosticContext,
  type WithDiagnosticContext,
} from "./contract";

/**
 * Ambient diagnostic context (trace-386).
 *
 * One AsyncLocalStorage carries the frozen DiagnosticContext across the
 * awaits of a single operation. Concurrent operations never observe each
 * other's context; the envelope module moves the context across the
 * web/worker boundary instead.
 */

const storage = new AsyncLocalStorage<DiagnosticContext>();

export const withDiagnosticContext: WithDiagnosticContext = (context, run) =>
  storage.run(context, run);

export const getDiagnosticContext: GetDiagnosticContext = () =>
  storage.getStore();

export interface CreateDiagnosticContextInput {
  workspaceId: string;
  workItemId: string;
  clientProfileId?: string | null;
  operationId?: string;
  parentOperationId?: string;
  generationCorrelationId?: string;
  outputId?: string;
  inngestRunId?: string;
  attemptNumber?: number;
  releaseSha?: string;
  environment?: string;
  process?: DiagnosticProcess;
  dataOrigin?: DiagnosticDataOrigin;
}

function requireIdentity(value: string | undefined, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      `createDiagnosticContext requires a non-empty ${field}`,
    );
  }
  return value;
}

function fallbackIfBlank(
  value: string | undefined,
  fallback: string,
): string {
  return value !== undefined && value.trim().length > 0 ? value : fallback;
}

/**
 * Build a frozen-shape context from server-validated identity. Strict by
 * design: empty identity or a non-integer attempt is a programmer error and
 * throws. Lenient degradation (partial correlation, never rejection) applies
 * only to EXTERNAL data in the envelope extractor, never here.
 */
export function createDiagnosticContext(
  input: CreateDiagnosticContextInput,
  env: NodeJS.ProcessEnv = process.env,
): DiagnosticContext {
  const workspaceId = requireIdentity(input.workspaceId, "workspaceId");
  const workItemId = requireIdentity(input.workItemId, "workItemId");
  const operationId =
    input.operationId === undefined
      ? randomUUID()
      : requireIdentity(input.operationId, "operationId");
  if (
    input.attemptNumber !== undefined &&
    (typeof input.attemptNumber !== "number" ||
      !Number.isInteger(input.attemptNumber) ||
      input.attemptNumber < 0)
  ) {
    throw new TypeError(
      "createDiagnosticContext requires a non-negative integer attemptNumber",
    );
  }

  return {
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    workspaceId,
    clientProfileId: input.clientProfileId ?? null,
    workItemId,
    protocol: "single",
    operationId,
    ...(input.parentOperationId !== undefined ? { parentOperationId: input.parentOperationId } : {}),
    ...(input.generationCorrelationId !== undefined
      ? { generationCorrelationId: input.generationCorrelationId }
      : {}),
    ...(input.outputId !== undefined ? { outputId: input.outputId } : {}),
    ...(input.inngestRunId !== undefined ? { inngestRunId: input.inngestRunId } : {}),
    ...(input.attemptNumber !== undefined ? { attemptNumber: input.attemptNumber } : {}),
    releaseSha: fallbackIfBlank(
      input.releaseSha,
      env.RENDER_GIT_COMMIT ?? "unknown",
    ),
    environment: fallbackIfBlank(input.environment, env.NODE_ENV ?? "unknown"),
    process: input.process ?? "web",
    dataOrigin:
      input.dataOrigin ??
      (env.VITEST !== undefined || env.NODE_ENV === "test"
        ? "test"
        : "production"),
  };
}
