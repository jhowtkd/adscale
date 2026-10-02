// The structured outputs a model call may ask for (ticket 13, D-2; review of PR 614).
//
// Anthropic refuses part of JSON Schema with an HTTP 400 (anthropic-schema.ts), and the first real test found every vision call refused while no test
// noticed. A schema that can reach a provider must therefore be on a list a suite can scan, and a new one must not slip past it. `ModelOutput` is a
// branded type that only `defineModelOutput` produces, and `ModelCallRequest.output` asks for it: an unregistered `{ name, schema }` does not compile.
// A registered schema is the WIRE shape (what the model is asked for); counts and ranges are applied by the app after the call.

import type { ZodType } from "zod";

declare const registered: unique symbol;
export type ModelOutput = { readonly name: string; readonly schema: ZodType; readonly [registered]: true };

const outputs = new Map<string, ModelOutput>();

/** Registers one output by name. The same name and schema return the same entry; the same name with another schema is a code error. */
export function defineModelOutput(name: string, schema: ZodType): ModelOutput {
  const existing = outputs.get(name);
  if (existing) {
    if (existing.schema !== schema) throw new Error(`model_output_redefined: ${name}`);
    return existing;
  }
  const output = Object.freeze({ name, schema }) as ModelOutput;
  outputs.set(name, output);
  return output;
}

/** Every output defined so far (modules register on import). The scan in output-schemas.test.ts reads this list. */
export function registeredModelOutputs(): ReadonlyMap<string, ModelOutput> {
  return outputs;
}
