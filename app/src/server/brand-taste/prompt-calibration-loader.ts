import { loadVisualGuidanceProof } from "../repositories/visual-guidance-proof";
import { getGuidanceSelection, resolveGuidanceSelection } from "../repositories/guidance-selection";
import { RULE_CATEGORIES } from "./calibration-signal-types";
import { hashGuidanceContent, hashGuidanceSet, isGuidanceCategoryApplicable, renderLearnedGuidance, validateLearnedGuidanceBudget, LearnedGuidanceError,
  type EligibleGuidanceRevision, type GuidanceRole, type GuidanceWrapperLanguage, type LearnedGuidanceFragment, type LearnedGuidanceRef } from "./learned-guidance";
import { confirmedGuidanceMetadataSchema } from "./guidance-metadata";
import { buildBrandTasteProfile } from "./taste-profile";
import {
  buildBrandTastePromptSection,
  selectApplicableRules,
} from "./taste-application";
import {
  buildCorpusQualityPromptSection,
  MAX_CORPUS_QUALITY_RULES,
} from "@/server/human-quality/learning/corpus-quality-prompt";
import { listApprovedCalibrationRulesByCategories } from "@/server/repositories/calibration-rule";
import { listCalibrationSignalsForClientProfile } from "@/server/repositories/calibration-signal";
import {
  authorizeLocalLearning,
  type LocalLearningAuthorizationPort,
  type LocalLearningScope,
  type LocalLearningDenialReason,
} from "./local-learning-authorization";

const BRAND_TASTE_CATEGORIES = RULE_CATEGORIES.filter((c) => c !== "corpus_quality");

export interface PromptCalibrationContext {
  brandTasteSection: string[];
  corpusQualitySection: string[];
  appliedBrandRuleIds: string[];
  appliedCorpusRuleIds: string[];
  appliedRefs: LearnedGuidanceRef[];
}

export interface LocalLearningPromptInput extends LocalLearningScope {
  role: GuidanceRole;
  generationMode: string;
  format: string;
  language: GuidanceWrapperLanguage;
  fixedPromptVersion: string;
}
export type GuidanceOmissionReason = "metadata_unconfirmed" | "metadata_invalid" | "metadata_stale"
  | "reference_unavailable" | "rule_retired" | "revision_not_approved"
  | "role_mismatch" | "scope_mismatch" | "category_mismatch" | "visual_proof_missing" | "visual_proof_mismatch";
export type LocalLearningPromptContext = Omit<LearnedGuidanceFragment, "omissionReason"> & {
  omissionReason?: LearnedGuidanceFragment["omissionReason"] | LocalLearningDenialReason;
  omissions: Array<{ ruleId: string; reason: GuidanceOmissionReason }>;
};
export interface VisualGuidanceProofRequest extends LocalLearningPromptInput {
  clientProfileId: string;
  setHash: string;
  appliedRefs: readonly LearnedGuidanceRef[];
}
/** Trusted server-side proof lookup, for the exact-set visual calibration gate. */
export type VisualGuidanceProof = Omit<VisualGuidanceProofRequest, "appliedRefs"> & { status: "validated" | "pending" | "rejected" };
export type VisualGuidanceProofPort = (input: Readonly<VisualGuidanceProofRequest>) => Promise<VisualGuidanceProof | null>;

function matchesVisualProof(proof: VisualGuidanceProof, request: VisualGuidanceProofRequest): boolean {
  return proof.status === "validated" && ["workspaceId", "clientProfileId", "role", "generationMode", "format", "language", "fixedPromptVersion", "setHash"]
    .every(key => proof[key as keyof VisualGuidanceProof] === request[key as keyof VisualGuidanceProofRequest]);
}

/** Selection shared with calibration capture; never treats approval as visual proof. */
export async function selectCalibrationGuidance(input: LocalLearningPromptInput) {
  const scope = { workspaceId: input.workspaceId, clientProfileId: input.clientProfileId! };
  const selection = await getGuidanceSelection(scope);
  const rules = await resolveGuidanceSelection(scope, selection.refs);
  const revisions: EligibleGuidanceRevision[] = [];
  const visualIds = new Set<string>();
  const omissions: LocalLearningPromptContext["omissions"] = [];
  for (const { ref, revision: rule, currentStatus, retired } of rules) {
    const omit = (reason: GuidanceOmissionReason) => omissions.push({ ruleId: ref.ruleId, reason });
    if (!rule) { omit("reference_unavailable"); continue; }
    if (retired || currentStatus === "deprecated" || currentStatus === "rejected") { omit("rule_retired"); continue; }
    if (rule.status !== "approved") { omit("revision_not_approved"); continue; }
    if (!rule.confirmedMetadata || !rule.metadataConfirmedBy?.trim() || !rule.metadataConfirmedAt
      || !Number.isFinite(new Date(rule.metadataConfirmedAt).getTime())) { omit("metadata_unconfirmed"); continue; }
    const parsed = confirmedGuidanceMetadataSchema.safeParse(rule.confirmedMetadata);
    if (!parsed.success) { omit("metadata_invalid"); continue; }
    const metadata = parsed.data;
    if (metadata.contentHash !== hashGuidanceContent(rule.text)) { omit("metadata_stale"); continue; }
    if (!metadata.roles.includes(input.role)) { omit("role_mismatch"); continue; }
    if (!metadata.generationModes.includes(input.generationMode) || !metadata.formats.includes(input.format)) { omit("scope_mismatch"); continue; }
    if (!isGuidanceCategoryApplicable(input.role, metadata.category)) { omit("category_mismatch"); continue; }
    if (metadata.nature === "visual") visualIds.add(rule.ruleId);
    revisions.push({ ...ref, category: metadata.category, roles: metadata.roles, text: rule.text });
  }
  return { revisions, visualIds, omissions };
}

// D3: approved text needs no visual proof; visual guidance requires an exact-context proof.
export async function loadLocalLearningPromptCalibrationContext(
  input: LocalLearningPromptInput,
  authorize?: LocalLearningAuthorizationPort,
  loadVisualProof?: VisualGuidanceProofPort,
): Promise<LocalLearningPromptContext> {
  const authorization = await (authorize ?? authorizeLocalLearning)({ workspaceId: input.workspaceId, clientProfileId: input.clientProfileId });
  if (!authorization.allowed) return { lines: [], appliedRefs: [], setHash: null, omissionReason: authorization.reason, omissions: [] };
  const { revisions, visualIds, omissions } = await selectCalibrationGuidance(input);
  let eligible = revisions;
  if (visualIds.size) {
    const request = Object.freeze({ workspaceId: input.workspaceId, clientProfileId: input.clientProfileId!,
      role: input.role, generationMode: input.generationMode, format: input.format, language: input.language,
      fixedPromptVersion: input.fixedPromptVersion, setHash: hashGuidanceSet(revisions)!,
      appliedRefs: Object.freeze(revisions.map(({ ruleId, revision, contentHash }) => Object.freeze({ ruleId, revision, contentHash }))),
    });
    const proof = input.fixedPromptVersion.trim() && input.fixedPromptVersion !== "unknown"
      ? await (loadVisualProof ?? loadVisualGuidanceProof)(request) : null;
    if (!proof || !matchesVisualProof(proof, request)) {
      for (const ruleId of visualIds) omissions.push({ ruleId, reason: proof ? "visual_proof_mismatch" : "visual_proof_missing" });
      eligible = revisions.filter(revision => !visualIds.has(revision.ruleId));
    }
  }
  // D5 applies to the complete eligible set in both languages, without truncation.
  try {
    validateLearnedGuidanceBudget({ role: input.role, revisions: eligible });
  } catch (error) {
    if (!(error instanceof LearnedGuidanceError)) throw error;
    return { lines: [], appliedRefs: [], setHash: null, omissions,
      omissionReason: error.code === "budget_exceeded" ? "budget_exceeded" : "invalid_guidance" };
  }
  return { ...renderLearnedGuidance({ role: input.role, language: input.language, revisions: eligible }), omissions };
}

export async function loadPromptCalibrationContext(input: {
  workspaceId: string;
  clientProfileId: string | null;
}): Promise<PromptCalibrationContext> {
  if (!input.clientProfileId) {
    return {
      brandTasteSection: [],
      corpusQualitySection: [],
      appliedBrandRuleIds: [],
      appliedCorpusRuleIds: [],
      appliedRefs: [],
    };
  }

  const [signals, brandRules, corpusRules] = await Promise.all([
    listCalibrationSignalsForClientProfile({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: [...BRAND_TASTE_CATEGORIES],
    }),
    listApprovedCalibrationRulesByCategories({
      workspaceId: input.workspaceId,
      clientProfileId: input.clientProfileId,
      categories: ["corpus_quality"],
    }),
  ]);

  const profile = buildBrandTasteProfile({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    signals,
  });
  const brandApply = selectApplicableRules({ approvedRules: brandRules, profile });

  const appliedBrandRules = brandRules.filter((rule) =>
    brandApply.appliedRuleIds.includes(rule.id)
  );
  const brandTasteSection =
    appliedBrandRules.length > 0
      ? buildBrandTastePromptSection(
          appliedBrandRules.map((rule) => ({
            id: rule.id,
            category: rule.category,
            rationale: rule.rationale,
          }))
        )
      : [];

  const sortedCorpusRules = [...corpusRules]
    .sort(
      (a, b) =>
        (a.approvedAt ?? a.createdAt).getTime() - (b.approvedAt ?? b.createdAt).getTime()
    )
    .slice(-MAX_CORPUS_QUALITY_RULES);
  const corpusQualitySection = buildCorpusQualityPromptSection(sortedCorpusRules);

  return {
    brandTasteSection,
    corpusQualitySection,
    appliedBrandRuleIds: brandApply.appliedRuleIds,
    appliedCorpusRuleIds: sortedCorpusRules.map((rule) => rule.id),
    appliedRefs: [...appliedBrandRules, ...sortedCorpusRules].map((rule) => ({
      ruleId: rule.id,
      revision: "legacy",
      contentHash: hashGuidanceContent(rule.rationale),
    })),
  };
}
