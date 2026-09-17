import type {
  DiagnosticContentMode,
  ResolveContentPolicy,
} from "./contract";

/**
 * Diagnostic content policy (jhowtkd/adscale#391).
 *
 * Decides per workspace whether model input/output content may be captured
 * at all, and in which of the two frozen v1 modes. There is no `raw` mode:
 * unknown modes, unknown workspaces and every verification failure fail
 * closed to `metadata_only`.
 *
 * `redacted` requires ALL of the following, checked in this order (the
 * ordering is contractual — tests prove short-circuiting):
 *   1. content capture is not shut down;
 *   2. the `OBSERVABILITY_CONTENT_MODE` ceiling is exactly `redacted`
 *      (frozen default: `metadata_only`);
 *   3. the workspace is on `OBSERVABILITY_WORKSPACE_ALLOWLIST`
 *      (frozen default: empty — effectively no workspace);
 *   4. access verification passes (the audit write path works);
 *   5. deletion verification passes (remote removal was proven by re-query).
 *
 * Verification is injectable: per-call deps win, module-configured verifiers
 * are second, and the default is an unwired stub that denies. The live
 * probes (`probeContentAccessPath` in ./content-access, `probeRemoteDeletion`
 * in ./content-cleanup) are wired by the host process only after data-owner
 * approval — which does not exist in this session, so capture stays off.
 */

export const DIAGNOSTIC_CONTENT_POLICY_VERSION = "v1";

/**
 * Retention windows as DATA (jhowtkd/adscale#391) — the proposed values
 * from spec #382, deliberately NOT frozen in #384 and NOT approved here:
 * diagnostic index 30 days, AI traces 7 days, access audit 90 days.
 * Consumed by ./content-cleanup and the expiry check in ./content-access.
 * Effective only after data-owner approval; the gate record stays BLOCKED.
 */
export const DIAGNOSTIC_RETENTION_WINDOWS = {
  diagnosticIndexDays: 30,
  aiTracesDays: 7,
  accessAuditDays: 90,
} as const;

export type ContentPolicyVerifier = (workspaceId: string) => Promise<boolean>;

export interface ContentPolicyDeps {
  env?: NodeJS.ProcessEnv;
  verifyAccess?: ContentPolicyVerifier;
  verifyDeletion?: ContentPolicyVerifier;
}

interface ContentPolicyVerifiers {
  verifyAccess: ContentPolicyVerifier | null;
  verifyDeletion: ContentPolicyVerifier | null;
}

const denyAll: ContentPolicyVerifier = async () => false;

let configured: ContentPolicyVerifiers = {
  verifyAccess: null,
  verifyDeletion: null,
};
let captureShutdown = false;

/**
 * Wire the live verification probes (a host-process act that requires
 * data-owner approval). Tests reset this via __resetContentPolicyForTests.
 */
export function configureContentPolicyVerifiers(
  verifiers: ContentPolicyVerifiers,
): void {
  configured = { ...verifiers };
}

/**
 * Stop new content capture in this process. Policy resolution falls back to
 * `metadata_only` immediately; history is untouched and deletion routines
 * keep working (see ./content-cleanup). Idempotent, never throws.
 */
export function shutdownContentCapture(): void {
  try {
    captureShutdown = true;
  } catch {
    captureShutdown = true;
  }
}

export function isContentCaptureShutdown(): boolean {
  return captureShutdown;
}

/** Test-only reset. Never use in production code. */
export function __resetContentPolicyForTests(): void {
  configured = { verifyAccess: null, verifyDeletion: null };
  captureShutdown = false;
}

function parseAllowlist(env: NodeJS.ProcessEnv): string[] {
  try {
    const raw = env.OBSERVABILITY_WORKSPACE_ALLOWLIST ?? "";
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  } catch {
    return [];
  }
}

function readModeCeiling(env: NodeJS.ProcessEnv): DiagnosticContentMode | null {
  try {
    const raw = (env.OBSERVABILITY_CONTENT_MODE ?? "metadata_only").trim();
    if (raw === "metadata_only" || raw === "redacted") return raw;
    return null;
  } catch {
    return null;
  }
}

async function runVerifier(
  verifier: ContentPolicyVerifier,
  workspaceId: string,
): Promise<boolean> {
  try {
    return (await verifier(workspaceId)) === true;
  } catch {
    return false;
  }
}

async function resolveMode(
  workspaceId: string,
  deps: ContentPolicyDeps = {},
): Promise<DiagnosticContentMode> {
  if (typeof workspaceId !== "string" || workspaceId.trim().length === 0) {
    return "metadata_only";
  }
  if (captureShutdown) return "metadata_only";
  const env = deps.env ?? process.env;
  if (readModeCeiling(env) !== "redacted") return "metadata_only";
  if (!parseAllowlist(env).includes(workspaceId)) return "metadata_only";
  const verifyAccess = deps.verifyAccess ?? configured.verifyAccess ?? denyAll;
  if (!(await runVerifier(verifyAccess, workspaceId))) return "metadata_only";
  const verifyDeletion =
    deps.verifyDeletion ?? configured.verifyDeletion ?? denyAll;
  if (!(await runVerifier(verifyDeletion, workspaceId))) return "metadata_only";
  return "redacted";
}

/**
 * Frozen-compatible resolver with an optional deps extension point for
 * tests and the future approved host wiring. Assignable to the frozen
 * `ResolveContentPolicy` (proven in content-policy.test.ts).
 */
export type ResolveContentPolicyWithDeps = (
  workspaceId: string,
  deps?: ContentPolicyDeps,
) => Promise<DiagnosticContentMode>;

export const resolveContentPolicy: ResolveContentPolicyWithDeps = (
  workspaceId: string,
  deps?: ContentPolicyDeps,
) => resolveMode(workspaceId, deps);

export interface ContentCaptureGateStatus {
  blocked: boolean;
  reasons: string[];
  mode: DiagnosticContentMode | "unknown";
  allowlistedWorkspaces: string[];
  verifiersWired: boolean;
  shutdown: boolean;
  policyVersion: string;
}

/**
 * Effective capture-gate state for the given env: blocked unless mode +
 * allowlist + wired verifiers all agree and capture is not shut down.
 * Pure read of effective configuration — wiring or approval state.
 */
export function getContentCaptureGateStatus(
  deps: ContentPolicyDeps = {},
): ContentCaptureGateStatus {
  const env = deps.env ?? process.env;
  const mode = readModeCeiling(env) ?? "unknown";
  const allowlistedWorkspaces = parseAllowlist(env);
  const verifyAccess = deps.verifyAccess ?? configured.verifyAccess;
  const verifyDeletion = deps.verifyDeletion ?? configured.verifyDeletion;
  const verifiersWired = verifyAccess != null && verifyDeletion != null;
  const reasons: string[] = [];
  if (captureShutdown) reasons.push("content capture shutdown is active");
  if (mode !== "redacted") {
    reasons.push(
      `OBSERVABILITY_CONTENT_MODE is ${JSON.stringify(mode)} (redacted required)`,
    );
  }
  if (allowlistedWorkspaces.length === 0) {
    reasons.push("OBSERVABILITY_WORKSPACE_ALLOWLIST is empty");
  }
  if (!verifiersWired) {
    reasons.push(
      "access/deletion verification is not wired (no data-owner approval)",
    );
  }
  return {
    blocked: reasons.length > 0,
    reasons,
    mode,
    allowlistedWorkspaces,
    verifiersWired,
    shutdown: captureShutdown,
    policyVersion: DIAGNOSTIC_CONTENT_POLICY_VERSION,
  };
}
