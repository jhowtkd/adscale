import { deprecateCalibrationRule } from "@/server/brand-taste/calibration-rules";
import type { CalibrationRule } from "@/server/db/schema";
import { MAX_CORPUS_QUALITY_RULES } from "./corpus-quality-prompt";

export async function enforceCorpusQualityRuleCap(input: {
  workspaceId: string;
  clientProfileId: string;
  rules: CalibrationRule[];
  maxActive?: number;
}): Promise<{ active: CalibrationRule[]; deprecatedIds: string[] }> {
  const max = input.maxActive ?? MAX_CORPUS_QUALITY_RULES;
  const sorted = [...input.rules].sort(
    (a, b) =>
      (a.approvedAt ?? a.createdAt).getTime() - (b.approvedAt ?? b.createdAt).getTime()
  );

  if (sorted.length <= max) {
    return { active: sorted, deprecatedIds: [] };
  }

  const overflow = sorted.slice(0, sorted.length - max);
  for (const rule of overflow) {
    await deprecateCalibrationRule({
      workspaceId: input.workspaceId,
      ruleId: rule.id,
    });
  }

  return {
    active: sorted.slice(-max),
    deprecatedIds: overflow.map((r) => r.id),
  };
}
