/** File contracts and fixed tool commands for #473. No self-declared gate flags. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { evaluationVersionsSchema } from "../src/server/creative-work/semantic-review-evaluation";

export const JEV_TEST_FILES = [
  "src/server/creative-work/semantic-review-collection.pg.test.ts",
  "src/server/creative-work/semantic-review-processing.pg.test.ts",
  "src/server/creative-work/semantic-review-retention.pg.test.ts",
  "src/server/creative-work/semantic-review-export.pg.test.ts",
  "src/server/creative-work/semantic-review-ledger-retention.pg.test.ts",
  "src/server/creative-work/semantic-review-telemetry.pg.test.ts",
  "src/server/creative-work/semantic-review-evaluation.test.ts",
  "scripts/jev-collect.test.ts", "scripts/jev-process.test.ts", "scripts/jev-retain.test.ts",
  "scripts/jev-evaluate.test.ts", "scripts/jev-decide.test.ts",
  "src/server/jobs/semantic-review.test.ts", "src/server/jobs/semantic-review.pg.test.ts",
  "src/app/api/inngest/route.test.ts", "src/server/diagnostics/observability.test.ts",
] as const;
export const REGRESSION_FILES = [
  "src/server/creative-work/semantic-review-offline.test.ts", "src/server/creative-work/semantic-review-http.test.ts",
  "scripts/jev-authorized.test.ts", "src/server/diagnostics/contract.test.ts",
  "src/server/creative-work/prepared-plan.test.ts", "src/server/creative-work/fact-pack.test.ts",
  "src/server/application/prepare-creative-work.test.ts", "src/server/application/generate-creative-work.test.ts",
  "src/server/application/select-creative-work-output.test.ts", "src/server/application/resolve-creative-work-output-download.test.ts",
  "src/server/generation/settlement-adapters.test.ts", "src/server/creative-work/copy.test.ts",
  "src/server/diagnostics/context.test.ts", "src/server/diagnostics/journal.test.ts", "src/server/diagnostics/model-calls.test.ts",
] as const;
const vitest = ["node_modules/vitest/vitest.mjs", "run", "--config", "config/vitest.config.ts", "--project", "node"];
export const G0_COMMANDS = {
  jev_tests: [...vitest, ...JEV_TEST_FILES, "--reporter=json", "--outputFile=/proc/self/fd/3"],
  regressions: [...vitest, ...REGRESSION_FILES, "--reporter=json", "--outputFile=/proc/self/fd/3"],
  convergence_tests: ["npm", "run", "convergence:test"],
  convergence_gate: ["npm", "run", "convergence:gate"],
  boundary: ["scripts/check-jev-dependencies.mjs"],
  fixture: ["--conditions=react-server", "--import", "tsx", "scripts/run-jev-offline.ts"],
  load: ["npm", "run", "harness:jev-observer"],
} as const;
export const bytesDigest = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
export const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const shaSchema = z.string().regex(/^[0-9a-f]{40}$/);
export const countSchema = z.number().int().nonnegative().safe();
export const referenceSchema = z.string().url().max(2048).refine((s) => {
  const u = new URL(s); return u.protocol === "https:" && !u.username && !u.password && !u.hash && !s.includes("?");
});
export const receiptSchema = z.object({
  id: z.enum(["jev_tests", "regressions", "convergence_tests", "convergence_gate", "boundary", "fixture", "load"]),
  codeSha: shaSchema, command: z.array(z.string()), exitCode: countSchema,
  artifact: z.string().regex(/^[a-zA-Z0-9_-]+\.(?:json|log)$/), sha256: digestSchema,
}).strict();
export const incidentSchema = z.object({ kind: z.enum(["workspace_leak", "duplicate_send", "business_mutation", "raw_diagnostic"]),
  reference: referenceSchema, observedAt: z.string().datetime() }).strict();
/** One malformed element must never erase a concrete safety incident beside it. */
export function knownIncidentKinds(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.flatMap((item) => {
    const parsed = incidentSchema.pick({ kind: true }).passthrough().safeParse(item);
    return parsed.success ? [parsed.data.kind] : [];
  }) : [];
}
export const decisionPackageSchema = z.object({ version: z.literal(1), codeSha: shaSchema, versions: evaluationVersionsSchema,
  tools: z.array(receiptSchema), incidents: z.array(incidentSchema), evaluationRoot: z.string().optional(),
  exportApprovals: z.array(z.string()).optional(), operational: z.string().optional(), freeze: z.string().optional(),
}).strict();
const approval = z.object({ kind: z.enum(["data", "provider", "spend", "retention", "security", "limits", "tone"]),
  reference: referenceSchema, approvedBy: z.string().trim().min(1), approvedAt: z.string().datetime(), expiresAt: z.string().datetime().optional(), versions: evaluationVersionsSchema,
  workspaceIds: z.array(z.string().uuid()).min(1), clientProfileIds: z.array(z.string().uuid()).min(1),
  provider: z.literal("typesafe"), purpose: z.literal("prepared_work_semantic_review"),
}).strict();
const attestation = z.object({ reference: referenceSchema, recordedBy: z.string().trim().min(1), recordedAt: z.string().datetime(),
  codeSha: shaSchema, versions: evaluationVersionsSchema, environment: z.enum(["staging", "production"]),
}).strict();
export const operationalSchema = z.object({ version: z.literal(1), codeSha: shaSchema, versions: evaluationVersionsSchema,
  environment: z.enum(["staging", "production"]), language: z.literal("pt-BR"),
  owners: z.object({ product: z.string().trim().min(1), operations: z.string().trim().min(1), security: z.string().trim().min(1), reference: referenceSchema }).strict(),
  approvals: z.array(approval),
  smoke: attestation.extend({ authorizationReference: referenceSchema, startedAt: z.string().datetime(), finishedAt: z.string().datetime(),
    workspaceId: z.string().uuid(), clientProfileId: z.string().uuid(), observationId: z.string().uuid(),
    requestedModel: z.string(), returnedModel: z.string(), sendsStarted: countSchema, validResponses: countSchema,
  }).strict(),
  runtime: attestation.extend({ deploymentSha: shaSchema, jobId: z.literal("semantic-review-observer"), cron: z.literal("*/5 * * * *"),
    retries: z.literal(0), concurrency: z.literal(1) }).strict(),
  loadEnvironment: attestation.extend({ toolArtifactHash: digestSchema, comparableEnvironment: z.string().trim().min(1) }).strict(),
  audit: attestation.extend({ evaluationRoot: z.string(), manifestHashes: z.array(digestSchema).min(1),
    incidents: z.array(incidentSchema), normalFamilies: z.array(z.string()).min(1), difficultFamilies: z.array(z.string()).min(1),
  }).strict(),
}).strict();
export const G2_CRITERIA = {
  families: 300, calibration: 100, holdout: 200, falseAlertDenominator: 100, precisionDenominator: 30, incrementalDenominator: 30,
  validResponses: 0.95, falseAlert: 0.05, falseAlertWilsonUpper: 0.10, precision: 0.90, precisionWilsonLower: 0.80,
  incrementalDetection: 0.50, abstention: 0.20, reconstruction: 0.90,
} as const;
export const freezeSchema = z.object({ version: z.literal(1), reference: referenceSchema, frozenBy: z.string().trim().min(1),
  frozenAt: z.string().datetime(), holdoutOpenedAt: z.string().datetime(), codeSha: shaSchema, versions: evaluationVersionsSchema,
  evaluationRoot: z.string(), planHashes: z.array(digestSchema).min(1), criteriaHash: digestSchema,
  historyReference: referenceSchema,
  previousHoldout: z.object({ evaluationRoot: z.string(), versionsHash: digestSchema, criteriaHash: digestSchema, familyIds: z.array(z.string()).min(1) }).strict().nullable(),
}).strict();
