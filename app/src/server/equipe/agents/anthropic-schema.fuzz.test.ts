import { describe, expect, it } from "vitest";
import { unsupportedAnthropicSchemaKeywords } from "./anthropic-schema";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
type Rand = () => number;
const pick = <T,>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

// Noise made of harmless keywords only, so a planted one is the only thing the detector may report.
const SAFE_KEYS = ["type", "description", "title", "enum", "default", "minLength", "maxLength", "pattern", "format", "required", "nullable", "minItems", "const", "x-extra"];
const scalar = (r: Rand): unknown => pick(r, [null, true, false, 0, 1, "string", "#abc", 5, [], {}]);
/** Arbitrary JSON: any shape, including keys the detector knows, holding values of any type. */
function anyJson(r: Rand, depth: number): unknown {
  const roll = r();
  if (depth <= 0 || roll < 0.3) return scalar(r);
  if (roll < 0.55) return Array.from({ length: Math.floor(r() * 4) }, () => anyJson(r, depth - 1));
  const keys = [...SAFE_KEYS, "properties", "items", "anyOf", "oneOf", "allOf", "$defs", "additionalProperties", "not", "maxItems", "minimum", "multipleOf", "prefixItems"];
  return Object.fromEntries(Array.from({ length: Math.floor(r() * 5) }, () => [pick(r, keys), anyJson(r, depth - 1)]));
}
/** A schema-shaped tree free of every refused keyword (minItems stays 0 or 1, additionalProperties false). */
function cleanSchema(r: Rand, depth: number): Record<string, unknown> {
  const node: Record<string, unknown> = { type: pick(r, ["object", "array", "string", "number"]), ...(r() < 0.3 ? { minItems: pick(r, [0, 1]) } : {}), ...(r() < 0.3 ? { minLength: 1, maxLength: 100 } : {}),
    ...(r() < 0.2 ? { additionalProperties: false } : {}) };
  if (depth <= 0) return node;
  if (r() < 0.5) node.properties = Object.fromEntries(Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => [`p${i}`, cleanSchema(r, depth - 1)]));
  if (r() < 0.3) node.items = cleanSchema(r, depth - 1);
  for (const key of ["anyOf", "oneOf", "allOf"]) if (r() < 0.15) node[key] = Array.from({ length: 1 + Math.floor(r() * 2) }, () => cleanSchema(r, depth - 1));
  if (r() < 0.15) node.$defs = { d: cleanSchema(r, depth - 1) };
  return node;
}
const PLANTS: Array<{ keyword: string; apply: (node: Record<string, unknown>) => void }> = [
  { keyword: "maxItems", apply: n => { n.maxItems = 6; } },
  { keyword: "minItems", apply: n => { n.minItems = 2; } },
  { keyword: "minimum", apply: n => { n.minimum = 0; } },
  { keyword: "maximum", apply: n => { n.maximum = 10; } },
  { keyword: "exclusiveMinimum", apply: n => { n.exclusiveMinimum = 0; } },
  { keyword: "exclusiveMaximum", apply: n => { n.exclusiveMaximum = 9; } },
  { keyword: "multipleOf", apply: n => { n.multipleOf = 5; } },
  { keyword: "additionalProperties", apply: n => { n.additionalProperties = true; } },
];
/** Every node reachable through a place a schema is held, with where. */
function nodes(node: Record<string, unknown>, out: Record<string, unknown>[] = []) {
  out.push(node);
  const child = (v: unknown) => { if (typeof v === "object" && v !== null && !Array.isArray(v)) nodes(v as Record<string, unknown>, out); };
  for (const key of ["properties", "$defs"]) if (node[key]) Object.values(node[key] as object).forEach(child);
  for (const key of ["anyOf", "oneOf", "allOf"]) if (Array.isArray(node[key])) (node[key] as unknown[]).forEach(child);
  child(node.items);
  return out;
}

describe("unsupportedAnthropicSchemaKeywords fuzz", () => {
  it("never throws on arbitrary JSON, 3,000 cases", () => {
    const r = rng(11);
    for (let i = 0; i < 3000; i++) {
      const value = anyJson(r, 5);
      const out = unsupportedAnthropicSchemaKeywords(value);
      expect(Array.isArray(out)).toBe(true);
    }
    for (const odd of [null, undefined, 0, "", "x", true, [], [[]], {}, { properties: null }, { properties: [] }, { items: "x" }, { anyOf: {} }, { properties: { a: null } }]) {
      expect(unsupportedAnthropicSchemaKeywords(odd)).toEqual([]);
    }
  });

  it("reports nothing for a clean schema of any shape and depth (no false positive), 1,500 cases", () => {
    const r = rng(23);
    for (let i = 0; i < 1500; i++) expect(unsupportedAnthropicSchemaKeywords(cleanSchema(r, 5))).toEqual([]);
  });

  it("finds a keyword planted in any node, at any depth or position, and nothing else, 2,000 cases", () => {
    const r = rng(37);
    let deepest = 0;
    for (let i = 0; i < 2000; i++) {
      const schema = cleanSchema(r, 5);
      const all = nodes(schema);
      const target = pick(r, all);
      const plant = pick(r, PLANTS);
      plant.apply(target);
      deepest = Math.max(deepest, all.indexOf(target));
      const found = unsupportedAnthropicSchemaKeywords(schema);
      expect(found.map(f => f.keyword), `plant ${plant.keyword}`).toEqual([plant.keyword]);
    }
    expect(deepest).toBeGreaterThan(5);
  });

  it("finds several planted keywords at once, one report each", () => {
    const r = rng(41);
    for (let i = 0; i < 500; i++) {
      const schema = cleanSchema(r, 4);
      const all = nodes(schema);
      for (const target of all) if (r() < 0.4) pick(r, PLANTS).apply(target);
      // One report per (node, refused keyword) present; a keyword planted twice on one node replaces its first value.
      const expected = all.flatMap((node, index) => PLANTS.filter(p => (p.keyword === "minItems" ? (node.minItems as number) > 1 : p.keyword === "additionalProperties" ? node.additionalProperties === true : node[p.keyword] !== undefined)).map(p => `${index}:${p.keyword}`));
      expect(unsupportedAnthropicSchemaKeywords(schema)).toHaveLength(expected.length);
    }
  });

  it("minItems 0 and 1 and additionalProperties false are accepted, anything above is not", () => {
    expect(unsupportedAnthropicSchemaKeywords({ minItems: 0 })).toEqual([]);
    expect(unsupportedAnthropicSchemaKeywords({ minItems: 1 })).toEqual([]);
    expect(unsupportedAnthropicSchemaKeywords({ additionalProperties: false })).toEqual([]);
    expect(unsupportedAnthropicSchemaKeywords({ minItems: 2 })).toHaveLength(1);
  });
});
