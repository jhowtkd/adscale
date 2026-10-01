// What the Anthropic structured-output endpoint refuses in a JSON Schema (ticket 13, D-2).
//
// Measured on 01/10/2026 against claude-opus-5-5 (ticket 12, `dados/anthropic-schema-probe.json`): the endpoint answers HTTP 400
// `invalid_request_error` BEFORE the model runs, for array `minItems` other than 0 or 1, for any `maxItems`, for `minimum`/`maximum`/
// `multipleOf` and for `additionalProperties: true`. `minLength`, `maxLength`, `pattern`, `enum`, `format`, `default` and nullable types
// were accepted. A schema sent to Anthropic therefore describes only the SHAPE; a count or a range is checked by the app after the call
// (`siteVisionSchema` keeps the first 6 colors; `captionReviewSchema` validates the natures), never by the schema the model receives.

export type UnsupportedSchemaKeyword = { path: string; keyword: string; value: unknown };

/** Keywords refused whatever their value. `exclusive*` are the same numeric-bound family as `minimum`/`maximum` (not probed on their own). */
const REFUSED_KEYWORDS = ["maxItems", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"] as const;
/** Where a JSON Schema holds sub-schemas: as a map of names, as a list, or as a single schema. */
const SCHEMA_MAPS = ["properties", "patternProperties", "$defs", "definitions"] as const;
const SCHEMA_LISTS = ["anyOf", "oneOf", "allOf", "prefixItems"] as const;
const SCHEMAS = ["items", "additionalProperties", "not", "if", "then", "else", "contains", "propertyNames"] as const;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** Every refused keyword in a JSON Schema, with the path where it stands. Empty = the endpoint takes the schema. */
export function unsupportedAnthropicSchemaKeywords(schema: unknown): UnsupportedSchemaKeyword[] {
  const found: UnsupportedSchemaKeyword[] = [];
  const visit = (node: unknown, path: string) => {
    if (!isObject(node)) return;
    if (typeof node.minItems === "number" && node.minItems > 1) found.push({ path, keyword: "minItems", value: node.minItems });
    for (const keyword of REFUSED_KEYWORDS) if (node[keyword] !== undefined) found.push({ path, keyword, value: node[keyword] });
    if (node.additionalProperties === true) found.push({ path, keyword: "additionalProperties", value: true });
    const at = (key: string) => (path ? `${path}.${key}` : key);
    for (const key of SCHEMA_MAPS) if (isObject(node[key])) for (const [name, child] of Object.entries(node[key])) visit(child, at(`${key}.${name}`));
    for (const key of SCHEMA_LISTS) if (Array.isArray(node[key])) node[key].forEach((child, index) => visit(child, at(`${key}[${index}]`)));
    for (const key of SCHEMAS) visit(node[key], at(key));
  };
  visit(schema, "");
  return found;
}
