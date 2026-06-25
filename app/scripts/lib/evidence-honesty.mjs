/** @typedef {"live_human" | "fixture" | "accepted_caveat" | "technical_regression"} EvidenceSourceTag */

export const EVIDENCE_SOURCE = {
  LIVE_HUMAN: "live_human",
  FIXTURE: "fixture",
  ACCEPTED_CAVEAT: "accepted_caveat",
  TECHNICAL_REGRESSION: "technical_regression",
};

export const SOURCE_LABELS = ["synthetic_fixture", "operator_imported", "real_customer"];

export function emptySourceComposition() {
  return {
    synthetic_fixture: 0,
    operator_imported: 0,
    real_customer: 0,
  };
}

/**
 * @param {unknown} composition
 * @param {string} prefix
 * @param {string[]} errors
 */
export function validateSourceComposition(composition, prefix, errors) {
  if (!isPlainObject(composition)) {
    errors.push(`${prefix}.sourceComposition must be an object`);
    return;
  }

  for (const label of SOURCE_LABELS) {
    const value = composition[label];
    if (typeof value !== "number" || value < 0 || Number.isNaN(value)) {
      errors.push(`${prefix}.sourceComposition.${label} must be a non-negative number`);
    }
  }
}

/**
 * @param {Record<string, number>} composition
 */
export function isFixtureOnlySourceComposition(composition) {
  if (!isPlainObject(composition)) {
    return true;
  }
  return (composition.real_customer ?? 0) === 0;
}

const VALID_EVIDENCE_SOURCES = new Set(Object.values(EVIDENCE_SOURCE));

export function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} prefix
 * @param {string[]} errors
 */
export function validateDenominatorNote(value, prefix, errors) {
  if (value == null) {
    return;
  }
  if (typeof value !== "string" || value.length === 0) {
    errors.push(`${prefix}.denominatorNote must be a non-empty string when present`);
  }
}

/**
 * @param {unknown} section
 * @param {EvidenceSourceTag} expected
 * @param {string} prefix
 * @param {string[]} errors
 */
export function validateEvidenceSourceTag(section, expected, prefix, errors) {
  if (!isPlainObject(section)) {
    return;
  }
  if (section.evidenceSource !== expected) {
    errors.push(`${prefix}.evidenceSource must be "${expected}"`);
  } else if (!VALID_EVIDENCE_SOURCES.has(section.evidenceSource)) {
    errors.push(`${prefix}.evidenceSource is not a recognized tag`);
  }
  validateDenominatorNote(section.denominatorNote, prefix, errors);
}

/**
 * @param {unknown} guidance
 * @param {string} prefix
 * @param {string[]} errors
 */
export function validateSampleGuidanceEntry(guidance, prefix, errors) {
  if (!isPlainObject(guidance)) {
    errors.push(`${prefix} must be an object`);
    return;
  }

  for (const key of ["currentCount", "requiredCount", "additionalNeeded"]) {
    if (typeof guidance[key] !== "number" || guidance[key] < 0) {
      errors.push(`${prefix}.${key} must be a non-negative number`);
    }
  }

  if (typeof guidance.blockedClaim !== "string" || guidance.blockedClaim.length === 0) {
    errors.push(`${prefix}.blockedClaim must be a non-empty string`);
  }
}

/**
 * @param {unknown} sampleGuidance
 * @param {string} prefix
 * @param {string[]} errors
 */
export function validateSampleGuidanceArray(sampleGuidance, prefix, errors) {
  if (!Array.isArray(sampleGuidance)) {
    errors.push(`${prefix} must be an array`);
    return;
  }

  if (sampleGuidance.length === 0) {
    errors.push(`${prefix} must be a non-empty array when status is insufficient`);
    return;
  }

  let hasAdditionalNeeded = false;
  for (const [index, entry] of sampleGuidance.entries()) {
    validateSampleGuidanceEntry(entry, `${prefix}[${index}]`, errors);
    if (isPlainObject(entry) && entry.additionalNeeded > 0) {
      hasAdditionalNeeded = true;
    }
  }

  return hasAdditionalNeeded;
}

/**
 * @param {unknown} evidence
 * @param {string[]} errors
 * @param {string} label
 * @param {{ insufficientStatuses?: string[], movementFields?: string[], improvementField?: string }} options
 */
export function validateInsufficientSampleGuidance(evidence, errors, label, options = {}) {
  const insufficientStatuses = options.insufficientStatuses ?? ["insufficient_sample", "insufficient_corpus"];
  if (!insufficientStatuses.includes(evidence?.status)) {
    return false;
  }

  return validateSampleGuidanceArray(evidence.sampleGuidance, `${label}.sampleGuidance`, errors) ?? false;
}

/**
 * @param {unknown} evidence
 * @param {string[]} errors
 * @param {string} label
 * @param {{ movementPaths?: string[], improvementField?: string }} options
 */
export function rejectClaimsWhenGuidanceBlocked(evidence, errors, label, options = {}) {
  if (!Array.isArray(evidence?.sampleGuidance)) {
    return;
  }

  const blocked = evidence.sampleGuidance.some(
    (entry) => isPlainObject(entry) && entry.additionalNeeded > 0
  );
  if (!blocked) {
    return;
  }

  const improvementField = options.improvementField ?? "improvementClaimed";
  if (evidence[improvementField] === true) {
    errors.push(
      `${label}.${improvementField} must not be true when sampleGuidance has additionalNeeded > 0`
    );
  }

  for (const path of options.movementPaths ?? []) {
    const parts = path.split(".");
    let value = evidence;
    for (const part of parts) {
      value = value?.[part];
    }
    if (value != null) {
      errors.push(`${label}.${path} must be null when sampleGuidance has additionalNeeded > 0`);
    }
  }
}
