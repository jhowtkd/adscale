import { describe, expect, it } from "vitest";
import en from "../../../messages/en.json";
import ptBR from "../../../messages/pt-BR.json";

// Two guards for what the pilot's customers read (ticket 09):
//   1. The word "Equipe" is the internal name of the module. It never appears in customer text.
//   2. The keys the home / rail / mesa / first-open work added exist in both languages, with the same placeholders.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Every string leaf with its dotted path. Array items are addressed by index (`features.3`). */
function leaves(node: Json, prefix = ""): Array<{ path: string; value: string }> {
  if (typeof node === "string") return [{ path: prefix, value: node }];
  if (Array.isArray(node)) return node.flatMap((item, index) => leaves(item, prefix ? `${prefix}.${index}` : String(index)));
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) => leaves(value, prefix ? `${prefix}.${key}` : key));
  }
  return [];
}

function at(root: Json, dotted: string): Json | undefined {
  let node: Json | undefined = root;
  for (const segment of dotted.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, Json>)[segment];
  }
  return node;
}

const LOCALES = { "pt-BR": ptBR as Json, en: en as Json } as const;

/**
 * Where "Equipe" is allowed, each with its reason. Anything else is customer text that must say ADScale / Estrategista
 * (or nothing) instead.
 */
const EQUIPE_ALLOWED: Record<string, string> = {
  "settings.teamTab": "the workspace members tab: 'equipe' there means the people of the workspace, not the module",
  "settings.plans.compareTeam": "the plan comparison row for workspace members (team seats), same meaning as the tab",
  "settings.plans.tiers.growth.features.3": "'Equipe básica': the plan's team seats (workspace members), not the module",
  "settings.plans.tiers.scale.features.2": "'Equipe e permissões': workspace members and their permissions, not the module",
  "equipe.staffErrors.accountAlreadyExists": "staff-only console error; customers never see the staff screens",
  "equipe.labels.actorType.staff": "label of the staff actor in the staff consoles",
  "equipe.openAccount.title": "title of the staff-only 'open account' screen",
};

const WORD = /\bEquipe\b/;

describe("no 'Equipe' in customer text", () => {
  for (const [name, messages] of Object.entries(LOCALES)) {
    it(`${name}: the word only appears in the explicitly allowed places`, () => {
      const hits = leaves(messages).filter(({ value }) => WORD.test(value));
      const unexpected = hits.filter(({ path }) => !(path in EQUIPE_ALLOWED));
      expect(unexpected.map(({ path, value }) => `${path}: ${value}`)).toEqual([]);
    });
  }

  it("every allowed place still exists in at least one language, so the list cannot rot", () => {
    for (const path of Object.keys(EQUIPE_ALLOWED)) {
      const found = Object.values(LOCALES).some((messages) => typeof at(messages, path) === "string");
      expect(found, `${path} no longer exists: drop it from the allow-list`).toBe(true);
    }
  });

  it("every allowed place still carries the word in some language, so the exception is still needed", () => {
    for (const path of Object.keys(EQUIPE_ALLOWED)) {
      const carries = Object.values(LOCALES).some((messages) => {
        const value = at(messages, path);
        return typeof value === "string" && WORD.test(value);
      });
      expect(carries, `${path} no longer says Equipe: drop it from the allow-list`).toBe(true);
    }
  });

  it("the customer-facing surfaces of the pilot are free of the word, in both languages", () => {
    const surfaces = [
      "navigation.rail", "assistant.panel", "assistant.mesa", "assistant.handoff", "assistant.chat",
      "equipe.emptyScreens", "campaigns.creations", "transactionalEmails",
    ];
    for (const messages of Object.values(LOCALES)) {
      for (const surface of surfaces) {
        const node = at(messages, surface);
        expect(node, `${surface} is missing`).toBeDefined();
        expect(leaves(node as Json).filter(({ value }) => WORD.test(value))).toEqual([]);
      }
    }
  });
});

/** The ICU argument names a string uses, so a translation cannot drop or rename `{count}`. */
const placeholders = (value: string) => [...new Set([...value.matchAll(/\{(\w+)[,}]/g)].map((match) => match[1]))].sort();

/** What ticket 09 added. A subtree is checked whole; a list of keys is checked one by one. */
const NEW_KEYS: Array<{ path: string; only?: string[] }> = [
  { path: "navigation.rail" },
  { path: "assistant.panel" },
  { path: "assistant.mesa" },
  { path: "assistant.handoff", only: ["introText", "libraryBuilt", "readSite", "readProfile"] },
  { path: "equipe.emptyScreens" },
  { path: "campaigns.creations" },
  { path: "transactionalEmails.welcomeFirstOpen" },
];

describe("keys added for the home, rail and mesa exist in both languages", () => {
  for (const { path, only } of NEW_KEYS) {
    const label = only ? `${path}.{${only.join(",")}}` : path;
    it(`${label}: same keys, filled in, same placeholders`, () => {
      const collect = (messages: Json) => {
        const node = at(messages, path);
        expect(node, `${path} is missing`).toBeDefined();
        const all = leaves(node as Json);
        return only ? all.filter(({ path: leaf }) => only.includes(leaf.split(".")[0]!)) : all;
      };
      const pt = collect(LOCALES["pt-BR"]);
      const english = collect(LOCALES.en);
      if (only) {
        for (const key of only) {
          expect(pt.some(({ path: leaf }) => leaf === key), `pt-BR ${path}.${key}`).toBe(true);
          expect(english.some(({ path: leaf }) => leaf === key), `en ${path}.${key}`).toBe(true);
        }
      }
      expect(pt.length).toBeGreaterThan(0);
      expect(pt.map(({ path: leaf }) => leaf).sort()).toEqual(english.map(({ path: leaf }) => leaf).sort());
      const englishByPath = new Map(english.map(({ path: leaf, value }) => [leaf, value]));
      for (const { path: leaf, value } of pt) {
        expect(value.trim(), `pt-BR ${path}.${leaf} is empty`).not.toBe("");
        expect(englishByPath.get(leaf)?.trim(), `en ${path}.${leaf} is empty`).not.toBe("");
        expect(placeholders(englishByPath.get(leaf) ?? ""), `${path}.${leaf} placeholders`).toEqual(placeholders(value));
      }
    });
  }

  it("the library line and the empty-screen copy keep their placeholders", () => {
    expect(placeholders((ptBR.assistant.handoff as Record<string, string>).libraryBuilt!)).toEqual(["count"]);
    expect(placeholders(ptBR.navigation.rail.accountMenu)).toEqual(["name"]);
    expect(placeholders(ptBR.equipe.emptyScreens.library.description)).toEqual(["brand"]);
  });
});
