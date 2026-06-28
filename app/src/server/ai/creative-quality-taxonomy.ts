/**
 * Canonical quality dimension IDs shared by scoring, QA, and the quality gate.
 */

export type CreativeQualityDimensionId =
  | "legibility"
  | "ctaOffer"
  | "informationPreservation"
  | "briefMatch"
  | "formatFit"
  | "creativeRisk"
  | "styleFidelity"
  | "variationLevelFit";

/** QA checklist criterion — core dimensions always present in QA. */
export type CreativeQaCriterion = Exclude<
  CreativeQualityDimensionId,
  "variationLevelFit"
>;

export const CREATIVE_QA_CORE_CRITERIA: CreativeQaCriterion[] = [
  "legibility",
  "ctaOffer",
  "informationPreservation",
  "briefMatch",
  "formatFit",
  "creativeRisk",
];

/** Restyling-only optional criterion — not injected for non-restyling flows. */
export const CREATIVE_QA_OPTIONAL_CRITERIA = ["styleFidelity"] as const;

export const QA_CRITERION_DISPLAY_ORDER: CreativeQaCriterion[] = [
  ...CREATIVE_QA_CORE_CRITERIA,
  "styleFidelity",
];

/** Score JSON breakdown keys → canonical taxonomy IDs. */
export const SCORE_BREAKDOWN_TO_CRITERION: Record<string, CreativeQualityDimensionId> = {
  textLegibility: "legibility",
  ctaClarity: "ctaOffer",
  informationPreservation: "informationPreservation",
  briefMatch: "briefMatch",
  formatFit: "formatFit",
  visualQuality: "creativeRisk",
  variationLevelFit: "variationLevelFit",
};

export function mapScoreBreakdownKeyToCriterion(
  key: string
): CreativeQualityDimensionId | null {
  return SCORE_BREAKDOWN_TO_CRITERION[key] ?? null;
}

// --- Shared regex patterns for gate classification and score-issue promotion ---

export const WRONG_BRAND_PATTERN =
  /brand mismatch|wrong brand|client mismatch|wrong client|contradicts.*(?:brand|client)|competitor logo|not\s+acme/i;

export const UNSUPPORTED_OFFER_PATTERN =
  /unsupported claim|unsupported offer|not in contract|not in the contract|invented|fabricated|unsupported factual/i;

export const CTA_DRIFT_NOTE_PATTERN =
  /cta missing|missing cta|cta dropped|dropped cta|cta replaced|replaced cta|invented cta|wrong cta|cta not visible|cta absent|does not match contract/i;

export const CROPPED_CONTENT_PATTERN =
  /cropped|cut off|truncated|clipped|out of frame|hidden|deleted|removed from frame/i;

export const ILLEGIBILITY_PATTERN =
  /illegible|unreadable|too small to read|cannot read|hard to read|blurred text|low contrast text/i;

export const INVALID_FORMAT_LAYOUT_PATTERN =
  /invalid format|format layout|wrong aspect|aspect ratio|blur band|pasted poster|not native/i;

export const COPIED_STYLE_REFERENCE_PATTERN =
  /style reference|from style|copied from style|style-ref|style ref/i;

export const INVENTED_ENTITY_PATTERN =
  /invented|hallucinat|not in allowed|allowedentities|allowed entities|not appear in allowed|celebrity athlete|Eric Cantona|Manchester United/i;

export const UNAUTHORIZED_BRAND_PATTERN =
  /unauthorized brand|unlisted brand|brand not in allowed/i;

export const STYLE_REFERENCE_CONTAMINATION_PATTERN =
  /style reference contamination|copied.*style reference facts|factual.*from style reference|athlete portraits|team uniforms.*style reference|(?:people|portraits|uniforms).*from style reference/i;

export const CAMPAIGN_IDENTITY_DRIFT_PATTERN =
  /different campaign (?:identity|narrative)|(?:instead of|replaced with).*(?:narrative|story|enrollment)|education\/professor|not a faithful.*adaptation/i;

export const CAMPAIGN_IDENTITY_SAFE_PATTERN =
  /faithful|same campaign|preserved.*narrative|identical people/i;

export const REPLACED_SOURCE_SUBJECT_PATTERN =
  /replaced hero(?:\s+photo)?|different subject(?:\s+than base)?|new hero photo/i;

export const DECORATIVE_ONLY_PATTERN =
  /background(?:-|\s)?only|(?:only|just)\s+(?:background|glow|gradient)|without (?:a\s+)?(?:new\s+)?(?:visual\s+)?mechanism(?:\s+change)?|color(?:-|\s)?only\s+swap|decorative(?:-|\s)?only/i;

export {
  OVERLOAD_NOTE_MARKERS,
  GENERIC_TEMPLATE_NOTE_MARKERS,
  MISSING_DOMINANT_IDEA_MARKERS,
} from "./observable-rubric";
