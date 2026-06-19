export const FORBIDDEN_UI_FIRST_CREATIVE_TERMS = [
  "clickable-looking",
  "CTA module",
  "UI modules",
  "CTA button",
  "CTA buttons",
  "button-like modules",
  "card grid",
  "card-grid",
  "three-zone visual budget",
  "THREE-ZONE VISUAL BUDGET",
] as const;

export type ForbiddenUiFirstCreativeTerm =
  (typeof FORBIDDEN_UI_FIRST_CREATIVE_TERMS)[number];

export const UI_FIRST_REPLACEMENTS: Record<ForbiddenUiFirstCreativeTerm, string> = {
  "clickable-looking": "clear in the reading path with sufficient contrast",
  "CTA module": "invite placement and reading path",
  "UI modules": "information groups or visible information",
  "CTA button": "invite or call-to-action text",
  "CTA buttons": "invite or call-to-action text",
  "button-like modules": "competing invite treatments",
  "card grid": "competing equal-weight information groups",
  "card-grid": "dashboard-style grid layouts",
  "three-zone visual budget": "reading-path and gestalt budget",
  "THREE-ZONE VISUAL BUDGET": "READING PATH AND GESTALT BUDGET",
};

export const SCANNED_OLHAR_PROMPT_FILES = [
  "app/src/server/ai/prompt-builder.ts",
  "app/src/server/ai/per-mode-prompt-rules.ts",
  "app/src/server/ai/preflight-analysis.ts",
  "app/src/server/ai/observable-rubric.ts",
  "app/src/server/ai/creative-qa.ts",
  "app/src/server/ai/creative-score.ts",
] as const;

/**
 * Lines matching these patterns may contain forbidden terms when they are
 * negative examples, migration notes, or detection regexes — not live
 * creative instructions.
 */
export const ALLOWED_CONTEXT_PATTERNS: RegExp[] = [
  /^export const \w+_NOTE_MARKERS\s*=/,
  /^export const \w+_MARKERS\s*=/,
  /^\/.+\/[gimsuy]*;?$/,
];
