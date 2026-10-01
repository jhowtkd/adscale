// Every structured-output schema the Equipe sends to a model (ticket 13, D-2).
//
// Anthropic refuses part of JSON Schema with an HTTP 400 before the model runs (anthropic-schema.ts). The handoff's vision call and the
// caption review were sent with array bounds, so every call was rejected in production while no test noticed: the fakes accept anything.
// This suite RUNS each call site with a recording client, so it checks the schema that is really sent, and then guards the source so a new
// call site cannot hide from it. The roles' models are configurable, so every schema counts as one that can reach Anthropic.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { zodResponseFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import type { ZodType } from "zod";
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
import { runResearch } from "./research";
import { runTextReview, runVisualReview } from "./reviewers";

class HttpsStorage extends InMemoryObjectStorage {
  async signedDownloadUrl(key: string) { return `https://assets.example.com/${encodeURIComponent(key)}`; }
}

/** Runs every structured-output call site once and returns the schema each one sends, by output name. */
async function sentSchemas() {
  const sent = new Map<string, ZodType>();
  const recorder: EquipeModelClient = {
    async chat(request: ModelCallRequest) {
      if (request.output) sent.set(request.output.name, request.output.schema);
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

/** The names of every `output: { name: ... }` written in the Equipe source, a template name expanded over the item-work kinds. */
function declaredOutputNames() {
  const root = path.resolve(__dirname, "..");
  const names = new Set<string>();
  for (const file of readdirSync(root, { recursive: true, encoding: "utf8" })) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts") || file.includes(`testing${path.sep}`)) continue;
    for (const match of readFileSync(path.join(root, file), "utf8").matchAll(/output:\s*\{\s*name:\s*(?:"([^"]+)"|`([^`]+)`)/g)) {
      const [, literal, template] = match;
      if (literal) names.add(literal);
      else for (const kind of Object.keys(workOutputSchemas)) names.add(template!.replace("${input.kind}", kind));
    }
  }
  return [...names].sort();
}

describe("structured output schemas", () => {
  it("every call site is exercised, and the source declares no other (a new one must be added to this suite)", async () => {
    const sent = await sentSchemas();
    expect([...sent.keys()].sort()).toEqual(declaredOutputNames());
    // Guard the guard: the scan above is only worth something while it finds the known sites.
    expect(sent.size).toBeGreaterThanOrEqual(9);
  });

  it("none sends a restriction the Anthropic endpoint refuses (array bounds, numeric ranges, open objects)", async () => {
    const sent = await sentSchemas();
    // The same conversion the Anthropic client sends (zodResponseFormat), read for every keyword the endpoint answers 400 to.
    const refused = [...sent].flatMap(([name, schema]) => unsupportedAnthropicSchemaKeywords(zodResponseFormat(schema, name).json_schema.schema)
      .map(({ path: at, keyword, value }) => `${name}: ${at || "(root)"}.${keyword}=${JSON.stringify(value)}`));
    expect(refused).toEqual([]);
  });

  it("the Anthropic client takes each of them without refusing locally", async () => {
    for (const [name, schema] of await sentSchemas()) expect(() => toAnthropicOutputFormat({ name, schema }), name).not.toThrow();
  });
});
