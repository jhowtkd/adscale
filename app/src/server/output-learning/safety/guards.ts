import { createHash } from "node:crypto";
import { logger } from "@/lib/logger";
import type { ReadinessStatus } from "@/server/ai/creative-readiness";
import type { ClientOutputLearning } from "../../db/schema";
import type {
  OutputGenerationPrefill,
  OutputPrefillVariableKey,
} from "../recommendation/types";
import { OUTPUT_PREFILL_VARIABLE_KEYS } from "../recommendation/types";
import type {
  AppliedLearningTrace,
  AppliedLearningTraceEntry,
  BlockedPrefillField,
  SafetyGuardCode,
} from "./types";
import { OUTPUT_LEARNING_SAFETY_VERSION } from "./types";

const CREATIVE_LEVEL_RANK = {
  conservative: 0,
  balanced: 1,
  bold: 2,
  extreme: 3,
} as const;

type CreativeLevel = OutputGenerationPrefill["creativeLevel"];

function capCreativeLevel(level: CreativeLevel, max: CreativeLevel): CreativeLevel {
  return CREATIVE_LEVEL_RANK[level] > CREATIVE_LEVEL_RANK[max] ? max : level;
}

export function isApprovedPostgresLearning(learning: ClientOutputLearning): boolean {
  return learning.status === "approved";
}

/**
 * SAFE-02: only canonical approved Postgres rows may influence recommendations.
 * Mem0 hits or draft/superseded rows are excluded before ranking.
 */
export function filterApprovedPostgresLearnings(
  learnings: ClientOutputLearning[]
): ClientOutputLearning[] {
  return learnings.filter(isApprovedPostgresLearning);
}

export interface GuardPrefillContext {
  campaignGenerationMode?: string | null;
  readinessStatus?: ReadinessStatus | null;
}

export interface GuardPrefillResult {
  prefill: OutputGenerationPrefill;
  blockedFields: BlockedPrefillField[];
}

function recordBlock(
  blocked: BlockedPrefillField[],
  input: Omit<BlockedPrefillField, "resolvedValue"> & { resolvedValue: unknown }
): void {
  blocked.push(input);
}

/**
 * SAFE-01: sanitize bounded prefill so learnings cannot weaken v12.3 factual contracts.
 */
export function guardOutputLearningPrefill(
  prefill: OutputGenerationPrefill,
  context: GuardPrefillContext
): GuardPrefillResult {
  const blockedFields: BlockedPrefillField[] = [];
  let next: OutputGenerationPrefill = { ...prefill };

  const campaignMode = context.campaignGenerationMode?.trim() ?? "";

  if (
    campaignMode === "restyling" &&
    next.generationMode === "format_adaptation"
  ) {
    recordBlock(blockedFields, {
      field: "generationMode",
      requestedValue: "format_adaptation",
      resolvedValue: "art_variation",
      guardCode: "factual_mode_conflict",
      reason:
        "Restyling campaigns keep factual base/style separation; format_adaptation prefill blocked.",
    });
    next = { ...next, generationMode: "art_variation" };
  }

  if (context.readinessStatus === "blocked") {
    const cappedLevel = capCreativeLevel(next.creativeLevel, "conservative");
    if (cappedLevel !== next.creativeLevel) {
      recordBlock(blockedFields, {
        field: "creativeLevel",
        requestedValue: next.creativeLevel,
        resolvedValue: cappedLevel,
        guardCode: "readiness_blocked_cap",
        reason:
          "Readiness blocked — aggressive creative levels from learnings are capped to conservative.",
      });
      next = { ...next, creativeLevel: cappedLevel };
    }

    if (next.recipeId !== "safe_iteration") {
      recordBlock(blockedFields, {
        field: "recipeId",
        requestedValue: next.recipeId,
        resolvedValue: "safe_iteration",
        guardCode: "readiness_blocked_cap",
        reason:
          "Readiness blocked — only safe_iteration recipe may be prefilled from learnings.",
      });
      next = { ...next, recipeId: "safe_iteration" };
    }
  }

  if (next.generationMode === "format_adaptation") {
    const cappedLevel = capCreativeLevel(next.creativeLevel, "balanced");
    if (cappedLevel !== next.creativeLevel) {
      recordBlock(blockedFields, {
        field: "creativeLevel",
        requestedValue: next.creativeLevel,
        resolvedValue: cappedLevel,
        guardCode: "format_identity_creative_cap",
        reason:
          "Format adaptation preserves campaign identity — creative level capped at balanced.",
      });
      next = { ...next, creativeLevel: cappedLevel };
    }
  }

  return { prefill: next, blockedFields };
}

export function assertPrefillVariableKey(key: string): key is OutputPrefillVariableKey {
  return (OUTPUT_PREFILL_VARIABLE_KEYS as readonly string[]).includes(key);
}

function buildTraceId(
  campaignId: string,
  primaryLearningId: string,
  algorithmVersion: string
): string {
  return createHash("sha256")
    .update(
      `${campaignId}:${primaryLearningId}:${algorithmVersion}:${OUTPUT_LEARNING_SAFETY_VERSION}`
    )
    .digest("hex")
    .slice(0, 16);
}

export function buildAppliedLearningTrace(input: {
  campaignId: string;
  algorithmVersion: string;
  primaryLearning: ClientOutputLearning;
  supportingLearnings: ClientOutputLearning[];
  avoidPatternLearnings: ClientOutputLearning[];
  blockedFields: BlockedPrefillField[];
  prefillApplied: boolean;
}): AppliedLearningTrace {
  const preferEntries: AppliedLearningTraceEntry[] = input.supportingLearnings.map(
    (learning, index) => ({
      learningId: learning.id,
      variableKey: learning.variableKey,
      variableValue: learning.variableValue,
      preferenceDirection: learning.preferenceDirection as "prefer" | "avoid",
      applied:
        input.prefillApplied &&
        index === 0 &&
        learning.id === input.primaryLearning.id &&
        learning.preferenceDirection === "prefer",
      evidenceEventIds: (learning.supportingEvidence ?? []).map((ref) => ref.eventId),
      ...(index === 0 && input.blockedFields.length > 0
        ? {
            guardCode: input.blockedFields[0]?.guardCode,
            note: "Prefill sanitized by factual safety guards",
          }
        : {}),
    })
  );

  const avoidEntries: AppliedLearningTraceEntry[] = input.avoidPatternLearnings.map(
    (learning) => ({
      learningId: learning.id,
      variableKey: learning.variableKey,
      variableValue: learning.variableValue,
      preferenceDirection: "avoid" as const,
      applied: false,
      evidenceEventIds: (learning.supportingEvidence ?? []).map((ref) => ref.eventId),
      guardCode: "avoid_pattern_hint_only" as SafetyGuardCode,
      note: "Informational hint only — never applied to prompt or prefill",
    })
  );

  return {
    traceId: buildTraceId(
      input.campaignId,
      input.primaryLearning.id,
      input.algorithmVersion
    ),
    learningsSource: "postgres",
    safetyVersion: OUTPUT_LEARNING_SAFETY_VERSION,
    algorithmVersion: input.algorithmVersion,
    entries: [...preferEntries, ...avoidEntries],
    blockedFields: input.blockedFields,
    avoidPatternHints: input.avoidPatternLearnings.map((learning) => ({
      learningId: learning.id,
      pattern: learning.variableValue,
      confidence: learning.confidence as AppliedLearningTrace["avoidPatternHints"][number]["confidence"],
    })),
  };
}

export function logAppliedLearningTrace(
  trace: AppliedLearningTrace,
  context: { campaignId: string; workspaceId: string }
): void {
  logger.info(
    {
      campaignId: context.campaignId,
      workspaceId: context.workspaceId,
      traceId: trace.traceId,
      learningsSource: trace.learningsSource,
      appliedCount: trace.entries.filter((entry) => entry.applied).length,
      blockedFieldCount: trace.blockedFields.length,
      evidenceEventIds: trace.entries.flatMap((entry) => entry.evidenceEventIds),
    },
    "[output-learning] applied learning trace"
  );
}
