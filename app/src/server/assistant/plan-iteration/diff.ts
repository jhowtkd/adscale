import type { PlanVersionSnapshot } from "@/lib/assistant/artifact-version";

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
  return values.map((value) => value.trim()).filter(Boolean).sort();
}

function fieldChanged(
  field: PlanField,
  before: PlanVersionSnapshot,
  after: PlanVersionSnapshot
): boolean {
  if (field === "strategy" || field === "constraints") {
    return normalizeText(before[field]) !== normalizeText(after[field]);
  }
  const left = normalizeList(before[field]);
  const right = normalizeList(after[field]);
  return left.length !== right.length || left.some((value, index) => value !== right[index]);
}

function describeChange(field: PlanField): string {
  return `Campo ${FIELD_LABELS[field]} atualizado`;
}

export function buildPlanSemanticChanges(
  before: PlanVersionSnapshot,
  after: PlanVersionSnapshot
): { field: string; description: string }[] {
  return PLAN_FIELDS.filter((field) => fieldChanged(field, before, after)).map(
    (field) => ({
      field,
      description: describeChange(field),
    })
  );
}
