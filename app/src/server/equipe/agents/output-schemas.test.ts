// Every structured-output schema the Equipe sends to a model (ticket 13, D-2; review of PR 614).
//
// Anthropic refuses part of JSON Schema with an HTTP 400 before the model runs (anthropic-schema.ts). The handoff's vision call and the
// caption review were sent with array bounds, so every call was rejected in production while no test noticed: the fakes accept anything.
// A schema that can reach a provider is REGISTERED (model-output.ts: `ModelCallRequest.output` only takes what `defineModelOutput` made, so an
// unregistered one does not compile). This suite scans the registry, RUNS every call site with a recording client to prove that what is sent is
// exactly what is registered, and guards the source so a module that defines outputs cannot be left out of the scan. The roles' models are
// configurable, so every schema counts as one that can reach Anthropic.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { zodResponseFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { InMemoryObjectStorage } from "@/server/storage/in-memory-object-storage";
import { buildDiagnosisInput } from "../handoff/diagnosis";
import { createInstagramVision, createSiteVision } from "../handoff/site-vision";
import { workOutputSchemas } from "../module/agent-work-contract";
import { makeTestDeps } from "../module/testing/deps";
import { confirmedHandoff } from "../module/testing/diagnosis";
import { toAnthropicOutputFormat } from "./anthropic-client";
import { unsupportedAnthropicSchemaKeywords } from "./anthropic-schema";
import { runDiagnosis } from "./diagnosis";
import { runItemWork } from "./item-work";
import type { EquipeModelClient, ModelCallRequest } from "./model-client";
import { registeredModelOutputs, type ModelOutput } from "./model-output";
import { runResearch } from "./research";
import { runTextReview, runVisualReview } from "./reviewers";

/** The modules that define outputs. Loading them registers their outputs, so this suite imports every one of them (above). */
const DEFINING_MODULES = ["agents/diagnosis.ts", "agents/item-work.ts", "agents/research.ts", "agents/reviewers.ts", "handoff/site-vision.ts"];

class HttpsStorage extends InMemoryObjectStorage {
  async signedDownloadUrl(key: string) { return `https://assets.example.com/${encodeURIComponent(key)}`; }
}

/** Runs every structured-output call site once and returns the output each one asks for, by name. */
async function sentOutputs() {
  const sent = new Map<string, ModelOutput>();
  const recorder: EquipeModelClient = {
    async chat(request: ModelCallRequest) {
      if (request.output) sent.set(request.output.name, request.output);
      throw new Error("recorded");
    },
  };
  const attempt = (work: Promise<unknown>) => work.catch(() => undefined);

  await attempt(runResearch({ client: recorder, materials: [{ assetId: "00000000-0000-4000-8000-000000000001", label: "Site", excerpt: "texto" }] }));
  const fixture = await confirmedHandoff(makeTestDeps(), {});
  const [row] = await fixture.t.deps.uow.repos.handoffs.list(fixture.scope);
  await attempt(runDiagnosis({ client: recorder, diagnosis: buildDiagnosisInput(row!) }));
  await attempt(runTextReview({ client: recorder, copy: { headline: "h", body: "b", cta: "c" } }));
  await attempt(runVisualReview({ client: recorder, imageUrl: "https://example.com/a.png", brief: "brief" }));
  for (const kind of Object.keys(workOutputSchemas) as Array<keyof typeof workOutputSchemas>) {
    await attempt(runItemWork({ kind, client: recorder, model: "claude-opus-5-5", effort: "high", onModelCall: async () => undefined,
      input: { caption: "legenda", facts: [], note: "nota", now: "2026-10-01T12:00:00.000Z", scheduledFor: null } }));
  }
  const storage = new HttpsStorage();
  const jpeg = await sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  await storage.put("screenshot.jpg", jpeg, "image/jpeg");
  await attempt(createSiteVision({ storage, client: recorder })({ screenshotKey: "screenshot.jpg", colors: [], fonts: [] }));
  await attempt(createInstagramVision({ storage, client: recorder })({ imageKeys: ["screenshot.jpg"] }));
  return sent;
}

/** Every non-test source file under `src/server/equipe` that calls `defineModelOutput(`, relative to it (the registry's own file left out). */
function definingModules() {
  const root = path.resolve(__dirname, "..");
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.includes(`testing${path.sep}`) && file !== path.join("agents", "model-output.ts"))
    .filter((file) => readFileSync(path.join(root, file), "utf8").includes("defineModelOutput("))
    .map((file) => file.split(path.sep).join("/"))
    .sort();
}

describe("the registry of structured outputs", () => {
  it("the modules that define outputs are exactly the ones this suite loads (a new one must be added to the list above)", () => {
    expect(definingModules()).toEqual(DEFINING_MODULES);
  });

  it("every registered output is asked for by a call site, and what a call site sends IS the registered output", async () => {
    const sent = await sentOutputs();
    const registered = registeredModelOutputs();
    expect([...sent.keys()].sort()).toEqual([...registered.keys()].sort());
    for (const [name, output] of sent) expect(output, name).toBe(registered.get(name));
    // Guard the guard: the scan is only worth something while it finds the known sites.
    expect(sent.size).toBeGreaterThanOrEqual(9);
  });

});

describe("structured output schemas", () => {
  it("none sends a restriction the Anthropic endpoint refuses (array bounds, numeric ranges, open objects)", async () => {
    await sentOutputs(); // every defining module is loaded and every call site has run
    // The same conversion the Anthropic client sends (zodResponseFormat), read for every keyword the endpoint answers 400 to.
    const refused = [...registeredModelOutputs()].flatMap(([name, { schema }]) => unsupportedAnthropicSchemaKeywords(zodResponseFormat(schema, name).json_schema.schema)
      .map(({ path: at, keyword, value }) => `${name}: ${at || "(root)"}.${keyword}=${JSON.stringify(value)}`));
    expect(refused).toEqual([]);
  });

  it("the Anthropic client takes each of them without refusing locally", async () => {
    await sentOutputs();
    for (const [name, output] of registeredModelOutputs()) expect(() => toAnthropicOutputFormat(output), name).not.toThrow();
  });
});
