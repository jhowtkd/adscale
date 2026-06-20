/**
 * Record Jhonatan's Cenbrap calibration decisions into output_decision_events.
 *
 * Default is dry-run (no writes). Pass --confirm to apply.
 *
 * Usage:
 *   npx tsx scripts/record-cenbrap-calibration-decisions.ts --dry-run
 *   npx tsx scripts/record-cenbrap-calibration-decisions.ts --confirm --input ../.planning/phases/145-jhonatan-decision-capture-and-mismatch-triage/145-DECISIONS.json
 */
import "./load-env";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  normalizeExportStatusPayload,
  normalizeOlharVerdictPayload,
} from "@/server/ai/olhar/dual-verdict";
import { db } from "@/server/db";
import { outputDecisionEvents, user, workspaceMembers } from "@/server/db/schema";
import { recordOutputDecisionEvidence } from "@/server/output-learning/output-decision-recorder";
import type { OutputDecisionAction } from "@/server/output-learning/output-decision-events";
import { recordCalibrationSignal } from "@/server/brand-taste/calibration-signal-recorder";
import { buildCalibrationIdempotencyKey } from "@/server/brand-taste/calibration-signal";
import type { CalibrationSourceLabel } from "@/server/brand-taste/calibration-signal-types";
import { getCampaignById } from "@/server/repositories/campaign";
import { resolveCampaignClientProfileId } from "@/server/repositories/client-reference";
import { getDerivationById } from "@/server/repositories/derivation";
import {
  CENBRAP_MISMATCH_BUCKETS,
  type CenbrapMismatchBucket,
} from "@/server/olhar-calibration/cenbrap-calibration";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(SCRIPT_DIR, "..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const PHASE_DIR = path.join(
  REPO_ROOT,
  ".planning/phases/145-jhonatan-decision-capture-and-mismatch-triage"
);
const DEFAULT_INPUT = path.join(PHASE_DIR, "145-DECISIONS.template.json");
const DEFAULT_CALIBRATION = path.join(
  REPO_ROOT,
  ".planning/phases/142-cenbrap-calibration-and-release-evidence/142-CENBRAP-CALIBRATION.json"
);

export const MISMATCH_BUCKETS = CENBRAP_MISMATCH_BUCKETS;

export const HUMAN_DECISIONS = ["entra", "quase", "nao_entra"] as const;

const humanDecisionSchema = z.enum(HUMAN_DECISIONS);
const mismatchBucketSchema = z.enum(MISMATCH_BUCKETS);

const decisionRowSchema = z.object({
  derivationId: z.string().uuid(),
  campaignId: z.string().uuid(),
  campaignName: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
  outputRef: z.string().optional(),
  olharVerdict: z.string().optional(),
  exportStatus: z.string().optional(),
  sourceLabel: z.string().optional(),
  humanDecisionSource: z.string().optional(),
  decision: humanDecisionSchema.nullable(),
  mismatchBucket: mismatchBucketSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  reviewer: z.string().min(1),
  reviewedAt: z.string().datetime().nullable(),
});

const decisionsFileSchema = z.object({
  schemaVersion: z.number().int(),
  phase: z.number().int().optional(),
  sourceLabel: z.string().optional(),
  reviewer: z.string().min(1),
  reviewerEmail: z.string().email().optional(),
  status: z.string().optional(),
  decisions: z.array(decisionRowSchema).min(1),
});

const calibrationRowSchema = z.object({
  derivation: z.object({
    id: z.string().uuid(),
    campaignId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    olharVerdictValue: z.string().nullable().optional(),
    exportStatusValue: z.string().nullable().optional(),
    outputRef: z.string().nullable().optional(),
    dualVerdictState: z.string().optional(),
    packageEligible: z.boolean().optional(),
  }),
  human: z
    .object({
      humanDecisionSource: z.string().optional(),
    })
    .optional(),
});

const calibrationFileSchema = z.object({
  campaigns: z.array(
    z.object({
      campaign: z.object({
        id: z.string().uuid(),
        name: z.string(),
        workspaceId: z.string().uuid(),
      }),
      rows: z.array(calibrationRowSchema),
    })
  ),
});

export type HumanDecision = z.infer<typeof humanDecisionSchema>;
export type MismatchBucket = CenbrapMismatchBucket;
export type DecisionRowInput = z.infer<typeof decisionRowSchema>;
export type DecisionsFileInput = z.infer<typeof decisionsFileSchema>;

interface CliOptions {
  confirm: boolean;
  dryRun: boolean;
  input: string;
  calibration: string;
  reviewerEmail?: string;
}

interface CalibrationRowIndex {
  derivationId: string;
  campaignId: string;
  campaignName: string;
  workspaceId: string;
  olharVerdict: string | null;
  exportStatus: string | null;
  outputRef: string | null;
  reviewReady: boolean;
}

interface ApplyResult {
  derivationId: string;
  campaignName: string;
  decision: HumanDecision | null;
  action: OutputDecisionAction | null;
  idempotencyKey: string;
  status: "would_record" | "recorded" | "skipped_existing" | "skipped_pending";
  eventId?: string;
  reviewedAt: string | null;
  reviewer: string;
}

function usage(): string {
  return [
    "Usage: npx tsx scripts/record-cenbrap-calibration-decisions.ts [options]",
    "",
    "Options:",
    "  --dry-run                 Preview without DB writes (default when --confirm omitted)",
    "  --confirm                 Apply output_decision_events writes",
    "  --input <path>            Decisions JSON (default: 145-DECISIONS.template.json)",
    "  --calibration <path>      Calibration JSON for derivation validation",
    "  --reviewer-email <email>  Resolve reviewer user id (default from decisions file)",
  ].join("\n");
}

function parseArgs(argv: string[]): CliOptions {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(usage());
    process.exit(0);
  }

  const inputIndex = argv.indexOf("--input");
  const calibrationIndex = argv.indexOf("--calibration");
  const reviewerEmailArg = argv.find((arg) => arg.startsWith("--reviewer-email="));
  const reviewerEmailIndex = argv.indexOf("--reviewer-email");

  const input =
    inputIndex >= 0
      ? path.resolve(argv[inputIndex + 1] ?? "")
      : DEFAULT_INPUT;
  const calibration =
    calibrationIndex >= 0
      ? path.resolve(argv[calibrationIndex + 1] ?? "")
      : DEFAULT_CALIBRATION;

  let reviewerEmail = reviewerEmailArg?.split("=")[1]?.trim().toLowerCase();
  if (!reviewerEmail && reviewerEmailIndex >= 0) {
    reviewerEmail = argv[reviewerEmailIndex + 1]?.trim().toLowerCase();
  }

  const confirm = argv.includes("--confirm");

  return {
    confirm,
    dryRun: !confirm || argv.includes("--dry-run"),
    input,
    calibration,
    reviewerEmail,
  };
}

function loadJson<T>(filePath: string): T {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

export function indexCalibrationRows(
  calibration: z.infer<typeof calibrationFileSchema>
): Map<string, CalibrationRowIndex> {
  const index = new Map<string, CalibrationRowIndex>();

  for (const section of calibration.campaigns) {
    for (const row of section.rows) {
      const derivation = row.derivation;
      const reviewReady =
        derivation.dualVerdictState !== "missing_dual_verdict" &&
        Boolean(derivation.outputRef?.startsWith("derivation:")) &&
        derivation.packageEligible !== false;

      index.set(derivation.id, {
        derivationId: derivation.id,
        campaignId: derivation.campaignId,
        campaignName: section.campaign.name,
        workspaceId: derivation.workspaceId,
        olharVerdict: derivation.olharVerdictValue ?? null,
        exportStatus: derivation.exportStatusValue ?? null,
        outputRef: derivation.outputRef ?? null,
        reviewReady,
      });
    }
  }

  return index;
}

export function buildIdempotencyKey(derivationId: string, reviewer: string): string {
  return `phase145:cenbrap-calibration:${derivationId}:${reviewer}`;
}

export function mapHumanDecisionToAction(
  decision: HumanDecision
): OutputDecisionAction {
  return decision === "entra" ? "approved" : "rejected";
}

export function mapHumanDecisionToVerdict(
  decision: HumanDecision
): "entra" | "quase" | "nao_entra" {
  return decision;
}

export function buildSnapshotExtras(input: {
  decision: HumanDecision;
  mismatchBucket?: MismatchBucket | null;
  note?: string | null;
  olharVerdict?: string | null;
  exportStatus?: string | null;
}) {
  const olharVerdict = input.olharVerdict
    ? { value: input.olharVerdict }
    : undefined;
  const exportStatus = input.exportStatus
    ? { value: input.exportStatus }
    : undefined;

  if (input.decision === "entra") {
    return {
      ...(olharVerdict ? { olharVerdict } : {}),
      ...(exportStatus ? { exportStatus } : {}),
      ...(input.mismatchBucket
        ? {
            reason: {
              code: input.mismatchBucket,
              text: input.note?.trim() || undefined,
              source: "calibration_bucket",
            },
          }
        : {}),
    };
  }

  const code = input.decision === "quase" ? "quase" : "nao_entra";
  return {
    ...(olharVerdict ? { olharVerdict } : {}),
    ...(exportStatus ? { exportStatus } : {}),
    reason: {
      code,
      text: input.note?.trim() || undefined,
      source: input.mismatchBucket ?? "direction_reason",
    },
  };
}

export function validateDecisionsAgainstCalibration(input: {
  decisions: DecisionRowInput[];
  calibrationIndex: Map<string, CalibrationRowIndex>;
}): void {
  for (const row of input.decisions) {
    const calibrationRow = input.calibrationIndex.get(row.derivationId);
    if (!calibrationRow) {
      throw new Error(
        `Derivation ${row.derivationId} not found in calibration JSON`
      );
    }
    if (!calibrationRow.reviewReady) {
      throw new Error(
        `Derivation ${row.derivationId} is not review_ready in calibration JSON`
      );
    }
    if (row.campaignId !== calibrationRow.campaignId) {
      throw new Error(
        `Campaign mismatch for derivation ${row.derivationId}: input=${row.campaignId} calibration=${calibrationRow.campaignId}`
      );
    }
    if (row.workspaceId && row.workspaceId !== calibrationRow.workspaceId) {
      throw new Error(
        `Workspace mismatch for derivation ${row.derivationId}: input=${row.workspaceId} calibration=${calibrationRow.workspaceId}`
      );
    }
  }
}

async function resolveReviewerUserId(email: string): Promise<string> {
  const normalized = email.toLowerCase().trim();
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, normalized))
    .limit(1);

  const match = rows[0];
  if (!match) {
    throw new Error(`Reviewer user not found for email ${normalized}`);
  }
  return match.id;
}

async function findExistingDecisionEvent(
  workspaceId: string,
  idempotencyKey: string
) {
  const rows = await db
    .select()
    .from(outputDecisionEvents)
    .where(
      and(
        eq(outputDecisionEvents.workspaceId, workspaceId),
        eq(outputDecisionEvents.idempotencyKey, idempotencyKey)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

async function resolveClientProfileIdForCampaign(
  workspaceId: string,
  campaignId: string,
  cache: Map<string, string>
): Promise<string> {
  const cacheKey = `${workspaceId}:${campaignId}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const campaign = await getCampaignById(campaignId, workspaceId);
  if (!campaign) {
    throw new Error(`Campaign ${campaignId} not found in workspace ${workspaceId}`);
  }

  const clientProfileId = await resolveCampaignClientProfileId(workspaceId, {
    clientProfileId: campaign.clientProfileId,
    client: campaign.client,
  });
  if (!clientProfileId) {
    throw new Error(
      `Could not resolve client profile for campaign ${campaignId} (client=${campaign.client ?? "null"})`
    );
  }

  cache.set(cacheKey, clientProfileId);
  return clientProfileId;
}

async function assertWorkspaceMembership(
  workspaceId: string,
  userId: string
): Promise<void> {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);

  if (!rows[0]) {
    throw new Error(
      `Reviewer user ${userId} is not a member of workspace ${workspaceId}`
    );
  }
}

export async function applyCalibrationDecisions(input: {
  decisionsFile: DecisionsFileInput;
  calibrationIndex: Map<string, CalibrationRowIndex>;
  userId: string;
  confirm: boolean;
}): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  const campaignProfileCache = new Map<string, string>();

  for (const row of input.decisionsFile.decisions) {
    const calibrationRow = input.calibrationIndex.get(row.derivationId)!;

    if (!row.decision) {
      results.push({
        derivationId: row.derivationId,
        campaignName: row.campaignName ?? calibrationRow.campaignName,
        decision: null,
        action: null,
        idempotencyKey: buildIdempotencyKey(row.derivationId, row.reviewer),
        status: "skipped_pending",
        reviewedAt: row.reviewedAt,
        reviewer: row.reviewer,
      });
      continue;
    }

    if (!row.reviewedAt) {
      throw new Error(
        `reviewedAt is required when decision is set for derivation ${row.derivationId}`
      );
    }

    const action = mapHumanDecisionToAction(row.decision);
    const idempotencyKey = buildIdempotencyKey(row.derivationId, row.reviewer);
    const existing = await findExistingDecisionEvent(
      calibrationRow.workspaceId,
      idempotencyKey
    );

    if (existing) {
      results.push({
        derivationId: row.derivationId,
        campaignName: row.campaignName ?? calibrationRow.campaignName,
        decision: row.decision,
        action,
        idempotencyKey,
        status: "skipped_existing",
        eventId: existing.id,
        reviewedAt: row.reviewedAt,
        reviewer: row.reviewer,
      });
      continue;
    }

    if (!input.confirm) {
      results.push({
        derivationId: row.derivationId,
        campaignName: row.campaignName ?? calibrationRow.campaignName,
        decision: row.decision,
        action,
        idempotencyKey,
        status: "would_record",
        reviewedAt: row.reviewedAt,
        reviewer: row.reviewer,
      });
      continue;
    }

    const derivation = await getDerivationById(
      row.derivationId,
      calibrationRow.workspaceId
    );
    if (!derivation) {
      throw new Error(`Derivation ${row.derivationId} not found in database`);
    }

    const olharVerdict = normalizeOlharVerdictPayload(derivation.olharVerdict);
    const exportStatus = normalizeExportStatusPayload(derivation.exportStatus);
    const clientProfileId = await resolveClientProfileIdForCampaign(
      calibrationRow.workspaceId,
      row.campaignId,
      campaignProfileCache
    );

    const event = await recordOutputDecisionEvidence({
      workspaceId: calibrationRow.workspaceId,
      userId: input.userId,
      clientProfileId,
      campaignId: row.campaignId,
      derivationId: row.derivationId,
      action,
      source: "scripts.record-cenbrap-calibration-decisions",
      snapshotInput: derivation,
      snapshotExtras: buildSnapshotExtras({
        decision: row.decision,
        mismatchBucket: row.mismatchBucket,
        note: row.note,
        olharVerdict: olharVerdict?.value ?? calibrationRow.olharVerdict,
        exportStatus: exportStatus?.value ?? calibrationRow.exportStatus,
      }),
      idempotencyKey,
    });

    const sourceLabel = (row.sourceLabel ??
      input.decisionsFile.sourceLabel ??
      "synthetic_fixture") as CalibrationSourceLabel;

    await recordCalibrationSignal({
      workspaceId: calibrationRow.workspaceId,
      clientProfileId,
      campaignId: row.campaignId,
      derivationId: row.derivationId,
      outputDecisionEventId: event.id,
      humanVerdict: mapHumanDecisionToVerdict(row.decision),
      systemOlharVerdict: olharVerdict?.value ?? calibrationRow.olharVerdict,
      systemExportStatus: exportStatus?.value ?? calibrationRow.exportStatus,
      mismatchBucket: row.mismatchBucket ?? null,
      sourceLabel,
      reviewerId: input.userId,
      reviewedAt: row.reviewedAt,
      sanitizedNote: row.note?.trim() ?? null,
      idempotencyKey: buildCalibrationIdempotencyKey({
        workspaceId: calibrationRow.workspaceId,
        derivationId: row.derivationId,
        reviewerId: input.userId,
      }),
    });

    results.push({
      derivationId: row.derivationId,
      campaignName: row.campaignName ?? calibrationRow.campaignName,
      decision: row.decision,
      action,
      idempotencyKey,
      status: "recorded",
      eventId: event.id,
      reviewedAt: row.reviewedAt,
      reviewer: row.reviewer,
    });
  }

  return results;
}

function printResults(
  results: ApplyResult[],
  options: { confirm: boolean; sourceLabel?: string }
): void {
  const pending = results.filter((row) => row.status === "skipped_pending");
  const actionable = results.filter((row) => row.status !== "skipped_pending");

  console.log(
    JSON.stringify(
      {
        mode: options.confirm ? "confirm" : "dry-run",
        sourceLabel: options.sourceLabel ?? "synthetic_fixture",
        summary: {
          totalRows: results.length,
          pendingHumanInput: pending.length,
          wouldRecord: results.filter((row) => row.status === "would_record")
            .length,
          recorded: results.filter((row) => row.status === "recorded").length,
          skippedExisting: results.filter((row) => row.status === "skipped_existing")
            .length,
        },
        results,
      },
      null,
      2
    )
  );

  if (pending.length > 0) {
    console.warn(
      `${pending.length} row(s) still pending human decision — fill 145-DECISIONS.json before --confirm.`
    );
  }

  if (!options.confirm && actionable.some((row) => row.status === "would_record")) {
    console.log("Dry-run complete — pass --confirm to write output_decision_events.");
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const decisionsFile = decisionsFileSchema.parse(loadJson(options.input));
  const calibration = calibrationFileSchema.parse(
    loadJson(options.calibration)
  );
  const calibrationIndex = indexCalibrationRows(calibration);

  validateDecisionsAgainstCalibration({
    decisions: decisionsFile.decisions,
    calibrationIndex,
  });

  const reviewerEmail =
    options.reviewerEmail ?? decisionsFile.reviewerEmail ?? "dev@adscale.local";

  let userId: string | undefined;
  if (options.confirm) {
    userId = await resolveReviewerUserId(reviewerEmail);
    const workspaceIds = new Set(
      decisionsFile.decisions
        .map((row) => row.workspaceId ?? calibrationIndex.get(row.derivationId)?.workspaceId)
        .filter((id): id is string => Boolean(id))
    );
    for (const workspaceId of workspaceIds) {
      await assertWorkspaceMembership(workspaceId, userId);
    }
  }

  const results = await applyCalibrationDecisions({
    decisionsFile,
    calibrationIndex,
    userId: userId ?? "dry-run",
    confirm: options.confirm,
  });

  printResults(results, {
    confirm: options.confirm,
    sourceLabel: decisionsFile.sourceLabel,
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
