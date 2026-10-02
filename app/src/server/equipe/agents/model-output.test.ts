// The registry of structured outputs (ticket 13, review of PR 614). Its own file: the registry is global to a module graph, and this one
// defines outputs of its own, which must not show up in the scan of output-schemas.test.ts.

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineModelOutput, registeredModelOutputs } from "./model-output";

describe("defineModelOutput", () => {
  it("gives back the same frozen entry for the same name and schema, and lists it", () => {
    const schema = z.object({ a: z.string() });
    const first = defineModelOutput("registry_probe", schema);
    expect(defineModelOutput("registry_probe", schema)).toBe(first);
    expect(first).toMatchObject({ name: "registry_probe", schema });
    expect(Object.isFrozen(first)).toBe(true);
    expect(registeredModelOutputs().get("registry_probe")).toBe(first);
  });

  it("refuses another schema under a name already taken: two shapes cannot hide behind one name", () => {
    defineModelOutput("registry_clash", z.object({ a: z.string() }));
    expect(() => defineModelOutput("registry_clash", z.object({ b: z.string() }))).toThrow("model_output_redefined: registry_clash");
  });
});
