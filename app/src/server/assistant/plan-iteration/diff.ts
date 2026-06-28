import { planVersionSnapshotSchema } from "@/lib/assistant/artifact-version";
import type { ArtifactVersionComparison } from "@/lib/assistant/artifact-version";
import type { z } from "zod";

type PlanVersionSnapshot = z.infer<typeof planVersionSnapshotSchema>;

const PLAN_FIELDS = ["strategy", "angles", "hooks", "ctas", "constraints"] as const;
type PlanField = (typeof PLAN_FIELDS)[number];

const FIELD_LABELS: Record<PlanField, string> = {
  strategy: "estratégia",
  angles: "ângulos",
  hooks: "ganchos",
  ctas: "CTAs",
  constraints: "restrições",
};

function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}

function describeChange(field: PlanField): string {
  return `Campo ${FIELD_LABELS[field]} atualizado`;
}

export function buildPlanSemanticChanges(
  before: PlanVersionSnapshot,
  after: PlanVersionSnapshot
): { field: string; description: string }[] {
  return buildPlanSemanticComparison(before, after).map(({ field }) => ({
    field,
    description: describeChange(field),
  }));
}

type PlanComparisonField = Extract<
  ArtifactVersionComparison,
  { type: "plan" }
>["fields"][number];
type PlanComparisonChange = PlanComparisonField["changes"][number];

function scalarChanges(
  before: string | null,
  after: string | null
): PlanComparisonChange[] {
  const left = normalizeText(before);
  const right = normalizeText(after);
  const kind =
    left === right
      ? "unchanged"
      : left === null
        ? "add"
        : right === null
          ? "remove"
          : "edit";
  return [{ kind, before: left, after: right, beforeIndex: null, afterIndex: null }];
}

function listChanges(before: string[], after: string[]): PlanComparisonChange[] {
  const left = normalizeList(before);
  const right = normalizeList(after);
  const unmatchedAfter = new Set(right.map((_, index) => index));
  const matched = new Map<number, number>();

  // ponytail: lists are schema-bounded to 50 items; replace with indexed queues only if that ceiling grows.
  for (const [beforeIndex, value] of left.entries()) {
    const afterIndex = right.findIndex(
      (candidate, index) => unmatchedAfter.has(index) && candidate === value
    );
    if (afterIndex >= 0) {
      matched.set(beforeIndex, afterIndex);
      unmatchedAfter.delete(afterIndex);
    }
  }

  const unmatchedBefore = left
    .map((_, index) => index)
    .filter((index) => !matched.has(index));
  const remainingAfter = [...unmatchedAfter];
  const editedCount = Math.min(unmatchedBefore.length, remainingAfter.length);
  const changes: PlanComparisonChange[] = [...matched].map(
    ([beforeIndex, afterIndex]) => ({
      kind: beforeIndex === afterIndex ? "unchanged" : "move",
      before: left[beforeIndex] ?? null,
      after: right[afterIndex] ?? null,
      beforeIndex,
      afterIndex,
    })
  );

  for (let index = 0; index < editedCount; index += 1) {
    const beforeIndex = unmatchedBefore[index] as number;
    const afterIndex = remainingAfter[index] as number;
    changes.push({
      kind: "edit",
      before: left[beforeIndex] ?? null,
      after: right[afterIndex] ?? null,
      beforeIndex,
      afterIndex,
    });
  }
  for (const beforeIndex of unmatchedBefore.slice(editedCount)) {
    changes.push({
      kind: "remove",
      before: left[beforeIndex] ?? null,
      after: null,
      beforeIndex,
      afterIndex: null,
    });
  }
  for (const afterIndex of remainingAfter.slice(editedCount)) {
    changes.push({
      kind: "add",
      before: null,
      after: right[afterIndex] ?? null,
      beforeIndex: null,
      afterIndex,
    });
  }

  return changes.sort(
    (a, b) =>
      (a.afterIndex ?? a.beforeIndex ?? 0) -
      (b.afterIndex ?? b.beforeIndex ?? 0)
  );
}

export function buildPlanSemanticComparison(
  before: PlanVersionSnapshot,
  after: PlanVersionSnapshot,
  includeUnchanged = false
): PlanComparisonField[] {
  return PLAN_FIELDS.map((field) => {
    const changes =
      field === "strategy" || field === "constraints"
        ? scalarChanges(before[field], after[field])
        : listChanges(before[field], after[field]);
    return {
      field,
      label: FIELD_LABELS[field],
      changed: changes.some((change) => change.kind !== "unchanged"),
      changes,
    };
  }).filter((field) => includeUnchanged || field.changed);
}
