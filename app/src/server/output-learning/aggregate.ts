import type { OutputDecisionEvent } from "../db/schema";
import {
  computeOutputLearningConfidence,
  resolvePolarityForVariable,
  shouldApproveOutputLearning,
  shouldSupersedeOutputLearning,
} from "./confidence";
import type {
  DerivedOutputLearningDraft,
  OutputLearningEvidenceRef,
  OutputLearningStatus,
} from "./types";
import { OUTPUT_LEARNING_ALGORITHM_VERSION } from "./types";
import {
  extractVariablesFromEvent,
  normalizeOutputVariableKey,
  normalizeScopeValue,
  buildOutputLearningStatement,
} from "./variable-value";

function learningGroupKey(
  variableKey: string,
  variableValue: string,
  scopeGenerationMode: string,
  scopeFormat: string
) {
  return `${variableKey}::${variableValue.trim().toLowerCase()}::${scopeGenerationMode}::${scopeFormat}`;
}

function buildEvidenceRef(input: {
  event: OutputDecisionEvent;
  variableKey: string;
  variableValue: string;
  polarity: OutputLearningEvidenceRef["polarity"];
}): OutputLearningEvidenceRef {
  const snapshot = input.event.contextSnapshot;
  return {
    eventId: input.event.id,
    campaignId: input.event.campaignId,
    derivationId: input.event.derivationId,
    action: input.event.action,
    direction: input.event.direction,
    strength: input.event.strength,
    variableKey: input.variableKey,
    variableValue: input.variableValue,
    polarity: input.polarity,
    generationMode: snapshot.generationMode ?? null,
    format: snapshot.format ?? null,
    reasonCode:
      snapshot.reason?.code ??
      snapshot.hardFailures?.[0]?.code ??
      null,
    recordedAt: input.event.createdAt.toISOString(),
  };
}

export function extractEvidenceFromEvent(
  event: OutputDecisionEvent
): OutputLearningEvidenceRef[] {
  if (!event.clientProfileId) return [];

  const variables = extractVariablesFromEvent(event);
  const refs: OutputLearningEvidenceRef[] = [];

  for (const variable of variables) {
    const normalizedKey = normalizeOutputVariableKey(variable.variableKey);
    if (!normalizedKey) continue;

    const polarity = resolvePolarityForVariable({
      variableKey: normalizedKey,
      direction: event.direction,
    });

    refs.push(
      buildEvidenceRef({
        event,
        variableKey: normalizedKey,
        variableValue: variable.variableValue,
        polarity,
      })
    );
  }

  return refs;
}

export function aggregateOutputLearningsFromEvents(
  events: OutputDecisionEvent[]
): DerivedOutputLearningDraft[] {
  const evidence = events.flatMap((event) => extractEvidenceFromEvent(event));

  const groups = new Map<
    string,
    {
      variableKey: string;
      variableValue: string;
      scopeGenerationMode: string;
      scopeFormat: string;
      preferenceDirection: "prefer" | "avoid";
      supporting: OutputLearningEvidenceRef[];
      contradicting: OutputLearningEvidenceRef[];
    }
  >();

  for (const item of evidence) {
    const scopeGenerationMode = normalizeScopeValue(item.generationMode);
    const scopeFormat = normalizeScopeValue(item.format);
    const groupKey = learningGroupKey(
      item.variableKey,
      item.variableValue,
      scopeGenerationMode,
      scopeFormat
    );

    const preferenceDirection: "prefer" | "avoid" =
      item.variableKey === "avoid_pattern" ? "avoid" : "prefer";

    const bucket =
      groups.get(groupKey) ??
      {
        variableKey: item.variableKey,
        variableValue: item.variableValue,
        scopeGenerationMode,
        scopeFormat,
        preferenceDirection,
        supporting: [],
        contradicting: [],
      };

    if (item.polarity === "supporting") {
      bucket.supporting.push(item);
    } else {
      bucket.contradicting.push(item);
    }
    groups.set(groupKey, bucket);
  }

  const drafts: DerivedOutputLearningDraft[] = [];

  for (const group of groups.values()) {
    const supporting = [...group.supporting].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt)
    );
    const contradicting = [...group.contradicting].sort((a, b) =>
      b.recordedAt.localeCompare(a.recordedAt)
    );

    const { confidence, confidenceScore } = computeOutputLearningConfidence(
      supporting,
      contradicting
    );

    const campaignIds = new Set([
      ...supporting.map((item) => item.campaignId),
      ...contradicting.map((item) => item.campaignId),
    ]);

    const lastEvidenceAt = [...supporting, ...contradicting]
      .map((item) => new Date(item.recordedAt))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    let status: OutputLearningStatus = "draft";
    if (shouldSupersedeOutputLearning(supporting, contradicting)) {
      status = "superseded";
    } else if (
      shouldApproveOutputLearning(
        supporting,
        contradicting,
        confidence,
        group.preferenceDirection
      )
    ) {
      status = "approved";
    }

    drafts.push({
      variableKey: group.variableKey,
      variableValue: group.variableValue,
      scopeGenerationMode: group.scopeGenerationMode,
      scopeFormat: group.scopeFormat,
      preferenceDirection: group.preferenceDirection,
      statement: buildOutputLearningStatement({
        variableKey: group.variableKey,
        variableValue: group.variableValue,
        preferenceDirection: group.preferenceDirection,
        confidence,
        supportingCount: supporting.length,
        contradictingCount: contradicting.length,
        scopeGenerationMode: group.scopeGenerationMode,
        scopeFormat: group.scopeFormat,
      }),
      confidence,
      confidenceScore,
      sampleEventCount: supporting.length + contradicting.length,
      sampleCampaignCount: campaignIds.size,
      supportingEvidence: supporting,
      contradictingEvidence: contradicting,
      lastEvidenceAt,
      status,
    });
  }

  return drafts;
}

export { OUTPUT_LEARNING_ALGORITHM_VERSION };
