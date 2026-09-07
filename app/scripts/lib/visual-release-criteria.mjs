import { rejectEmptyVisualSuccess } from "./evidence-honesty.mjs";

/** Shared visual-release scenarios. Checker and Playwright must stay in lockstep. */
export const VISUAL_RELEASE_LAYOUT_SCENARIOS = [
  "SCN-DASHBOARD",
  "SCN-CAMPAIGN-LIST",
  "SCN-CAMPAIGN-WORKSPACE",
  "SCN-VARIATIONS-WORKSPACE",
  "SCN-LIBRARY",
  "SCN-TEMPLATES",
  "SCN-FEEDBACK",
  "SCN-SETTINGS",
  "SCN-STUDIO-CAROUSEL",
  "SCN-STUDIO-EDIT",
];

export const VISUAL_RELEASE_LAYOUT_VARIANTS = [
  "390x844",
  "768x844",
  "1024x900",
  "1280x900",
  "1440x900",
  "1920x900",
  "1280x480",
];

export const VISUAL_RELEASE_REQUIREMENT_IDS = ["RESP-07", "QA-15", "QA-16"];

export function expectedVisualLayoutKeys(scenarios = VISUAL_RELEASE_LAYOUT_SCENARIOS) {
  return scenarios.flatMap((scenario) =>
    VISUAL_RELEASE_LAYOUT_VARIANTS.map((viewport) => `${scenario}@${viewport}`),
  );
}

export function rejectEmptyOrPartialVisualRelease(evidence, errors, label = "114-EVIDENCE") {
  const layoutChecks = Array.isArray(evidence?.layoutChecks) ? evidence.layoutChecks : [];
  if (layoutChecks.length === 0) {
    errors.push(`${label}: empty visual evidence must not count as success`);
  }
  rejectEmptyVisualSuccess(
    {
      captures: layoutChecks,
      afterCaptures: evidence?.a11yChecks ?? [],
      requirements: VISUAL_RELEASE_REQUIREMENT_IDS.map((id) => ({
        id,
        result: evidence?.requirements?.[id]?.result,
      })),
    },
    errors,
    label,
  );
  for (const scenario of VISUAL_RELEASE_LAYOUT_SCENARIOS) {
    if (!layoutChecks.some((check) => check.scenario === scenario || String(check.key ?? "").startsWith(`${scenario}@`))) {
      errors.push(`${label}: missing unified scenario ${scenario}`);
    }
  }
}
