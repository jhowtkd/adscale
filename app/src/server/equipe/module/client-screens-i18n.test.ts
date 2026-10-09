import { describe, expect, it } from "vitest";
import ptMessages from "../../../../messages/pt-BR.json";
import enMessages from "../../../../messages/en.json";
import {
  EQUIPE_FRONT_KEY,
  EQUIPE_FRONT_STATUS,
  EQUIPE_IDEA_KIND,
  EQUIPE_IDEA_STATUS,
  EQUIPE_ITEM_STATUS,
  EQUIPE_MANDATE_STATUS,
  EQUIPE_ONBOARDING_STATUS,
  EQUIPE_ONBOARDING_STEP,
  EQUIPE_PERSON_ROLE,
  EQUIPE_STAFF_ROLE,
  EQUIPE_VERSION_STATUS,
} from "../../db/equipe-schema";

// The client screens never render raw enums: every stored value they can
// show has a translation in both locales. The lists below derive from the
// schema enums, so a new stored value fails here until it is translated.

const REVIEW_STATUSES = [
  "blocked",
  "edited_in_review",
  "edit_with_warning",
  "needs_confirmation",
  "ready",
] as const;

const BATCH_OUTCOMES = [
  "approved",
  "changed_since_opened",
  "not_ready",
  "already_decided",
  "unknown_item",
] as const;

const MATERIAL_KINDS = ["logo", "photo", "video", "text"] as const;

const ROLE_KEYS = [
  ...EQUIPE_PERSON_ROLE,
  ...EQUIPE_STAFF_ROLE,
  "staff",
  "strategist",
  "client_person",
  "agent",
  "system",
] as const;

function flatKeys(node: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (node && typeof node === "object" && !Array.isArray(node)) {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out.add(prefix + key);
      for (const nested of flatKeys(value, `${prefix}${key}.`)) out.add(nested);
    }
  }
  return out;
}

function hasText(locale: Record<string, unknown>, path: string): boolean {
  let node: unknown = locale;
  for (const segment of path.split(".")) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === "string" && node.length > 0;
}

const LOCALES = { "pt-BR": ptMessages, en: enMessages } as const;

const EXPECTED: Array<{ path: string; values: readonly string[]; prefix?: string }> = [
  { path: "equipe.roles", values: ROLE_KEYS },
  { path: "equipe.fronts", values: EQUIPE_FRONT_KEY },
  { path: "equipe.frontStatuses", values: EQUIPE_FRONT_STATUS },
  { path: "equipe.states", values: [...EQUIPE_ITEM_STATUS, ...REVIEW_STATUSES] },
  { path: "equipe.ideas", values: EQUIPE_IDEA_KIND, prefix: "kind_" },
  { path: "equipe.ideas", values: EQUIPE_IDEA_STATUS, prefix: "status_" },
  { path: "equipe.goals", values: EQUIPE_ONBOARDING_STEP, prefix: "step_" },
  { path: "equipe.goals", values: EQUIPE_ONBOARDING_STATUS, prefix: "stepStatus_" },
  { path: "equipe.goals", values: EQUIPE_VERSION_STATUS, prefix: "versionStatus_" },
  { path: "equipe.goals", values: EQUIPE_MANDATE_STATUS, prefix: "mandateStatus_" },
  { path: "equipe.goals", values: MATERIAL_KINDS, prefix: "materialKind_" },
  { path: "equipe.batch", values: BATCH_OUTCOMES, prefix: "outcome_" },
];

describe("equipe client-screens translations", () => {
  for (const [name, messages] of Object.entries(LOCALES)) {
    describe(name, () => {
      for (const { path, values, prefix } of EXPECTED) {
        it(`translates every ${path}${prefix ?? ""}* value`, () => {
          const missing = values.filter(
            (value) => !hasText(messages, `${path}.${prefix ?? ""}${value}`),
          );
          expect(missing).toEqual([]);
        });
      }
    });
  }

  it("keeps en/pt-BR key parity under equipe", () => {
    const en = flatKeys((enMessages as Record<string, unknown>).equipe);
    const pt = flatKeys((ptMessages as Record<string, unknown>).equipe);
    expect([...en].filter((key) => !pt.has(key))).toEqual([]);
    expect([...pt].filter((key) => !en.has(key))).toEqual([]);
  });
});
