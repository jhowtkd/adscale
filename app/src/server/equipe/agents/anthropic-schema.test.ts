// What the Anthropic structured-output endpoint refuses (ticket 13, D-2). The expectations are the measured matrix of ticket 12
// (`dados/anthropic-schema-probe.json`, 01/10/2026): accepted and refused keywords, one by one.

import { zodResponseFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { unsupportedAnthropicSchemaKeywords } from "./anthropic-schema";

const refusedIn = (schema: z.ZodType) => unsupportedAnthropicSchemaKeywords(zodResponseFormat(schema, "probe").json_schema.schema);

describe("unsupportedAnthropicSchemaKeywords", () => {
  it("accepts what the endpoint accepted: minItems 0 and 1, string bounds, pattern, enum, format, nullable", () => {
    const accepted = z.object({
      a: z.array(z.string()).min(1), b: z.array(z.string()), c: z.string().min(1).max(10), d: z.string().regex(/^#[0-9a-f]{6}$/i),
      e: z.enum(["x", "y"]), f: z.string().datetime(), g: z.string().nullable(), h: z.boolean().nullable(),
    });
    expect(refusedIn(accepted)).toEqual([]);
  });

  it("refuses minItems of 2 or more, any maxItems, any numeric range and multipleOf, each at its path", () => {
    expect(refusedIn(z.object({ list: z.array(z.string()).min(2) }))).toEqual([{ path: "properties.list", keyword: "minItems", value: 2 }]);
    expect(refusedIn(z.object({ list: z.array(z.string()).max(3) }))).toEqual([{ path: "properties.list", keyword: "maxItems", value: 3 }]);
    expect(refusedIn(z.object({ list: z.array(z.string()).min(1).max(6) }))).toEqual([{ path: "properties.list", keyword: "maxItems", value: 6 }]);
    expect(refusedIn(z.object({ n: z.number().int().min(1).max(5) })).map(h => h.keyword)).toEqual(["minimum", "maximum"]);
    expect(refusedIn(z.object({ n: z.number().gt(0).lt(9) })).map(h => h.keyword)).toEqual(["exclusiveMinimum", "exclusiveMaximum"]);
    expect(refusedIn(z.object({ n: z.number().multipleOf(5) })).map(h => h.keyword)).toEqual(["multipleOf"]);
  });

  it("refuses an open object (additionalProperties: true) but not a closed one or a typed map", () => {
    expect(refusedIn(z.object({ a: z.string() }).passthrough()).map(h => h.keyword)).toEqual(["additionalProperties"]);
    expect(refusedIn(z.object({ a: z.string() }).strict())).toEqual([]);
    expect(refusedIn(z.object({ labels: z.record(z.string()) }))).toEqual([]);
  });

  it("walks nested objects, array items, unions and definitions", () => {
    const nested = z.object({
      outer: z.object({ inner: z.array(z.object({ tags: z.array(z.string()).max(2) })) }),
      choice: z.union([z.object({ a: z.array(z.string()).min(3) }), z.string()]),
    });
    const paths = refusedIn(nested).map(h => `${h.path}:${h.keyword}`);
    expect(paths).toContain("properties.outer.properties.inner.items.properties.tags:maxItems");
    expect(paths.some(p => p.endsWith(":minItems"))).toBe(true);
    expect(paths).toHaveLength(2);
  });

  it("does not mistake a property NAMED like a refused keyword for the keyword", () => {
    const named = z.object({ maxItems: z.string(), minimum: z.array(z.string()), maximum: z.object({ multipleOf: z.string() }) });
    expect(refusedIn(named)).toEqual([]);
  });

  it("reads plain JSON, not only converted zod", () => {
    expect(unsupportedAnthropicSchemaKeywords({ type: "array", items: { type: "string" }, minItems: 1 })).toEqual([]);
    expect(unsupportedAnthropicSchemaKeywords({ type: "array", maxItems: 4 })).toEqual([{ path: "", keyword: "maxItems", value: 4 }]);
    expect(unsupportedAnthropicSchemaKeywords(null)).toEqual([]);
    expect(unsupportedAnthropicSchemaKeywords("string")).toEqual([]);
  });
});
