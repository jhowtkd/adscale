// Item work (ticket 13): the schema SENT to the model is the shape only; the app validates the answer with the strict contract.

import { describe, expect, it } from "vitest";
import { workOutputWireSchemas } from "../module/agent-work-contract";
import { runItemWork } from "./item-work";
import { FakeModelClient } from "./testing";

const input = { caption: "legenda", facts: [], note: "nota", now: "2026-10-01T12:00:00.000Z", scheduledFor: null };
const run = (content: unknown) => {
  const client = new FakeModelClient([{ content: JSON.stringify(content) }]);
  const result = runItemWork({ kind: "review_caption", input, client, model: "claude-opus-5-5", effort: "high", onModelCall: async () => undefined });
  return { client, result };
};

describe("runItemWork review_caption", () => {
  it("sends the wire schema (no maxItems) and still parses with the strict one", async () => {
    const { client, result } = run({ findings: [], summary: "Ok.", natures: ["none"] });
    await expect(result).resolves.toEqual({ findings: [], summary: "Ok.", natures: ["none"] });
    expect(client.requests[0]!.output).toEqual({ name: "equipe_review_caption", schema: workOutputWireSchemas.review_caption });
  });

  it("does not throw away a paid answer that lists a nature twice: the repeat is one nature", async () => {
    const { result } = run({ findings: [], summary: "Ok.", natures: ["permanent_fact", "none", "permanent_fact", "none", "regulated_claim"] });
    await expect(result).resolves.toMatchObject({ natures: ["permanent_fact", "none", "regulated_claim"] });
  });

  it("still refuses an answer with no nature at all, or one the contract does not know", async () => {
    await expect(run({ findings: [], summary: "Ok.", natures: [] }).result).rejects.toThrow();
    await expect(run({ findings: [], summary: "Ok.", natures: ["outra"] }).result).rejects.toThrow();
  });
});
