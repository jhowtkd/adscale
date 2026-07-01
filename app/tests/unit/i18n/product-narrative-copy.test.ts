import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import ptBR from "../../../messages/pt-BR.json";

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

const REVIEW_GUIDANCE_KEYS = [
  "approve",
  "reject",
  "feedbackPlaceholder",
  "blockingFailureHint",
  "polishSuggestionHint",
  "regenerateWithFixesDescription",
] as const;

/** Narrative namespaces scanned for locale parity (BRAND-03 / Phase 170). */
const PARITY_TARGETS: Array<{ path: string; filter?: (keys: string[]) => string[] }> = [
  { path: "onboarding" },
  { path: "dashboard.home" },
  { path: "metadata" },
  { path: "navigation" },
  { path: "auth" },
  { path: "campaign" },
  { path: "steps" },
  { path: "generation" },
  { path: "library" },
  { path: "template" },
  {
    path: "review",
    filter: (keys) => keys.filter((k) => REVIEW_GUIDANCE_KEYS.includes(k as (typeof REVIEW_GUIDANCE_KEYS)[number])),
  },
];

/**
 * Error keys that must exist in both catalogs (Sprint 1 / #2 reshape).
 * Scoped separately because the top-level `errors` namespace contains
 * pre-existing forbidden-pattern hits (e.g. "corpus") that are out of
 * scope for this sprint — we only enforce parity for the brand-kit
 * error keys we introduced.
 */
const BRAND_KIT_ERROR_PARITY_KEYS = [
  "brandKitAmbiguous",
  "clientProfileNotFound",
  "unknown",
] as const;

const OLHAR_SURFACES = new Set([
  "onboarding",
  "dashboard.home",
  "library",
  "generation",
  "template",
]);

/** Keys excluded from the generic `magic` hype pattern (auth magic-link UX). */
const MAGIC_LINK_KEY_PATTERN = /magicLink/i;

type ForbiddenRule = {
  id: string;
  pattern: RegExp;
  /** When set, rule applies only to these namespace paths. */
  namespaces?: Set<string>;
  /** Skip entries whose key matches (per-namespace full key path). */
  skipKey?: RegExp;
};

const FORBIDDEN_RULES: ForbiddenRule[] = [
  { id: "cenbrap", pattern: /cenbrap/i },
  { id: "calibration", pattern: /calibration/i },
  { id: "corpus", pattern: /corpus/i },
  { id: "agreement-rate", pattern: /agreement\s+rate/i },
  { id: "sample-sufficiency", pattern: /sample\s+sufficiency/i },
  {
    id: "olhar",
    pattern: /olhar/i,
    namespaces: OLHAR_SURFACES,
  },
  {
    id: "magic-hype",
    pattern: /\bmagic\b/i,
    skipKey: MAGIC_LINK_KEY_PATTERN,
  },
  { id: "revolutionary", pattern: /revolutionary/i },
  { id: "game-changer", pattern: /game[- ]?changer/i },
  { id: "does-everything", pattern: /does everything/i },
  { id: "one-click", pattern: /one click/i },
  { id: "substitutes-designer", pattern: /substitutes? the designer/i },
  { id: "10x", pattern: /\b10x\b/i },
  { id: "roas", pattern: /\broas\b/i },
  { id: "scale-without-hiring", pattern: /scale without hiring/i },
];

const CURATOR_STEP_KEYS = [
  "step1Desc",
  "step2Desc",
  "step3Desc",
  "step4Desc",
] as const;

const CURATOR_STEP_KEYS_FORBIDDEN_ONLY = ["step5Desc"] as const;

const CURATOR_FORBIDDEN_EN = /\b(curator|curate|curation)\b/i;
const CURATOR_FORBIDDEN_PT = /\b(curador|curar|curadoria)\b/i;

const CANONICAL_VOCABULARY_EN = /\b(brief|briefing|decision|supervision|supervise|approval|approve|review)\b/i;
const CANONICAL_VOCABULARY_PT = /\b(briefing|decis[aã]o|supervis[aã]o|supervisionar|aprova[cç][aã]o|aprovar|revisar)\b/i;

const WORKFLOW_CANONICAL_KEYS_EN: Array<{ path: string; label: string }> = [
  { path: "metadata.description", label: "metadata.description" },
  { path: "auth.signUpSubtitle", label: "auth.signUpSubtitle" },
  { path: "campaign.createDescription", label: "campaign.createDescription" },
  { path: "steps.reviewAll", label: "steps.reviewAll" },
];

const WORKFLOW_CANONICAL_KEYS_PT: Array<{ path: string; label: string }> = [
  { path: "metadata.description", label: "metadata.description" },
  { path: "auth.signUpSubtitle", label: "auth.signUpSubtitle" },
  { path: "campaign.createDescription", label: "campaign.createDescription" },
  { path: "steps.reviewAll", label: "steps.reviewAll" },
];

function getStringAtPath(obj: JsonObject, dotPath: string): string | undefined {
  const parts = dotPath.split(".");
  let current: JsonValue = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }
  return typeof current === "string" ? current : undefined;
}

function getAtPath(obj: JsonObject, dotPath: string): JsonObject | undefined {
  const parts = dotPath.split(".");
  let current: JsonValue = obj;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonObject)[part];
  }
  if (current === null || typeof current !== "object" || Array.isArray(current)) {
    return undefined;
  }
  return current as JsonObject;
}

/** Collect leaf keys as dot paths relative to the namespace root. */
function collectLeafKeys(obj: JsonObject, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      keys.push(path);
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value as JsonObject, path));
    }
  }
  return keys;
}

function collectStringEntries(
  obj: JsonObject,
  namespacePath: string,
  prefix = ""
): Array<{ key: string; value: string }> {
  const entries: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(obj)) {
    const relativeKey = prefix ? `${prefix}.${key}` : key;
    const fullKey = `${namespacePath}.${relativeKey}`;
    if (typeof value === "string") {
      entries.push({ key: fullKey, value });
    } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      entries.push(...collectStringEntries(value as JsonObject, namespacePath, relativeKey));
    }
  }
  return entries;
}

function namespaceEntries(messages: JsonObject, path: string): Array<{ key: string; value: string }> {
  const node = getAtPath(messages, path);
  if (!node) {
    return [];
  }
  return collectStringEntries(node, path);
}

function parityKeysForNamespace(messages: JsonObject, path: string, filter?: (keys: string[]) => string[]): string[] {
  const node = getAtPath(messages, path);
  if (!node) {
    return [];
  }
  const keys = collectLeafKeys(node);
  return filter ? filter(keys).sort() : keys.sort();
}

function findForbiddenViolations(
  messages: JsonObject,
  scanTargets: Array<{ path: string; filter?: (keys: string[]) => string[] }>
): Array<{ namespace: string; key: string; value: string; rule: string }> {
  const violations: Array<{ namespace: string; key: string; value: string; rule: string }> = [];

  for (const target of scanTargets) {
    const entries = namespaceEntries(messages, target.path);
    const allowedKeys = target.filter
      ? new Set(target.filter(entries.map((e) => e.key.replace(`${target.path}.`, ""))))
      : null;

    for (const entry of entries) {
      const relativeKey = entry.key.replace(`${target.path}.`, "");
      if (allowedKeys && !allowedKeys.has(relativeKey)) {
        continue;
      }

      for (const rule of FORBIDDEN_RULES) {
        if (rule.namespaces && !rule.namespaces.has(target.path)) {
          continue;
        }
        if (rule.skipKey && rule.skipKey.test(relativeKey)) {
          continue;
        }
        if (rule.pattern.test(entry.value)) {
          violations.push({
            namespace: target.path,
            key: entry.key,
            value: entry.value,
            rule: rule.id,
          });
        }
      }
    }
  }

  return violations;
}

describe("product narrative copy guard (Phase 170 / BRAND-04)", () => {
  describe("locale key parity", () => {
    for (const target of PARITY_TARGETS) {
      it(`en and pt-BR share keys for ${target.path}`, () => {
        const enKeys = parityKeysForNamespace(en as JsonObject, target.path, target.filter);
        const ptKeys = parityKeysForNamespace(ptBR as JsonObject, target.path, target.filter);

        const onlyEn = enKeys.filter((k) => !ptKeys.includes(k));
        const onlyPt = ptKeys.filter((k) => !enKeys.includes(k));

        expect(onlyEn, `keys only in en.json: ${onlyEn.join(", ")}`).toEqual([]);
        expect(onlyPt, `keys only in pt-BR.json: ${onlyPt.join(", ")}`).toEqual([]);
      });
    }
  });

  describe("forbidden claim patterns", () => {
    it("narrative namespaces contain no forbidden claims (en)", () => {
      const violations = findForbiddenViolations(en as JsonObject, PARITY_TARGETS);
      expect(violations).toEqual([]);
    });

    it("narrative namespaces contain no forbidden claims (pt-BR)", () => {
      const violations = findForbiddenViolations(ptBR as JsonObject, PARITY_TARGETS);
      expect(violations).toEqual([]);
    });
  });

  describe("canonical product vocabulary (Plan 02)", () => {
    for (const stepKey of CURATOR_STEP_KEYS) {
      it(`onboarding.${stepKey} avoids curator vocabulary and uses canonical terms`, () => {
        const onboarding = getAtPath(en as JsonObject, "onboarding");
        expect(onboarding).toBeDefined();
        const desc = onboarding?.[stepKey];
        expect(typeof desc).toBe("string");
        expect(CURATOR_FORBIDDEN_EN.test(desc as string)).toBe(false);
        expect(CANONICAL_VOCABULARY_EN.test(desc as string)).toBe(true);
      });
    }

    for (const stepKey of CURATOR_STEP_KEYS_FORBIDDEN_ONLY) {
      it(`onboarding.${stepKey} avoids curator vocabulary`, () => {
        const onboarding = getAtPath(en as JsonObject, "onboarding");
        expect(onboarding).toBeDefined();
        const desc = onboarding?.[stepKey];
        expect(typeof desc).toBe("string");
        expect(CURATOR_FORBIDDEN_EN.test(desc as string)).toBe(false);
      });
    }
  });

  describe("canonical product vocabulary (Plan 03 workflow)", () => {
    for (const { path, label } of WORKFLOW_CANONICAL_KEYS_EN) {
      it(`${label} avoids curator vocabulary and uses canonical terms (en)`, () => {
        const value = getStringAtPath(en as JsonObject, path);
        expect(typeof value).toBe("string");
        expect(CURATOR_FORBIDDEN_EN.test(value as string)).toBe(false);
        expect(CANONICAL_VOCABULARY_EN.test(value as string)).toBe(true);
      });
    }

    for (const { path, label } of WORKFLOW_CANONICAL_KEYS_PT) {
      it(`${label} avoids curator vocabulary and uses canonical terms (pt-BR)`, () => {
        const value = getStringAtPath(ptBR as JsonObject, path);
        expect(typeof value).toBe("string");
        expect(CURATOR_FORBIDDEN_PT.test(value as string)).toBe(false);
        expect(CANONICAL_VOCABULARY_PT.test(value as string)).toBe(true);
      });
    }
  });

  describe("brand-kit error key parity (Sprint 1 / #2 reshape)", () => {
    for (const key of BRAND_KIT_ERROR_PARITY_KEYS) {
      it(`errors.${key} exists in both catalogs`, () => {
        const enValue = getStringAtPath(en as JsonObject, `errors.${key}`);
        const ptValue = getStringAtPath(ptBR as JsonObject, `errors.${key}`);
        expect(typeof enValue, `errors.${key} missing in en.json`).toBe("string");
        expect(typeof ptValue, `errors.${key} missing in pt-BR.json`).toBe("string");
        expect((enValue as string).length).toBeGreaterThan(0);
        expect((ptValue as string).length).toBeGreaterThan(0);
      });
    }
  });
});
