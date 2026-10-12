export const MAX_CORPUS_QUALITY_RULES = 10;

export function buildCorpusQualityPromptSection(
  rules: Array<{ id: string; rationale: string; category: string }>
): string[] {
  if (rules.length === 0) {
    return [];
  }

  return [
    "CORPUS QUALITY CONSTRAINTS (human-evaluated patterns for this brand):",
    ...rules.map(
      (rule) => `[corpus-quality:${rule.id}] ${rule.category}: ${rule.rationale}`
    ),
    "Do not weaken factual text, CTA spelling, or export compliance.",
  ];
}
