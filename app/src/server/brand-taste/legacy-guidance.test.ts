import { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromptCalibrationContext } from "./prompt-calibration-loader";

const state = vi.hoisted(() => ({ selection: null as unknown, stored: null as unknown }));
const load = vi.hoisted(() => vi.fn());
vi.mock("./prompt-calibration-loader", () => ({ loadPromptCalibrationContext: load }));
vi.mock("../db", () => {
  const tx = {
    select: () => ({ from: () => ({ where: () => ({ for: async () => [{ selection: state.selection }] }) }) }),
    update: () => ({ set: (values: { frozenLegacyGuidance?: unknown; legacyGuidanceApplications?: unknown }) => ({
      where: () => {
        if (values.frozenLegacyGuidance) state.selection = values.frozenLegacyGuidance;
        if (values.legacyGuidanceApplications) state.stored = values.legacyGuidanceApplications;
        return { returning: async () => [{ id: "execution" }] };
      },
    }) }),
  };
  return { db: { ...tx, transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx) } };
});

import { freezeLegacyGuidance, recordLegacyGuidanceApplication } from "./legacy-guidance";
import { hashGuidanceContent, hashGuidanceSet } from "./learned-guidance";

const ref = { ruleId: "corpus", revision: "legacy" as const, contentHash: hashGuidanceContent("Literal approved text") };
const selection: PromptCalibrationContext = {
  brandTasteSection: [], appliedBrandRuleIds: [],
  corpusQualitySection: ["heading", "Literal approved text", "safety"],
  appliedCorpusRuleIds: ["corpus"], appliedRefs: [ref],
};
const scope = { workspaceId: "workspace", derivationId: "execution", clientProfileId: "brand" };

describe("Legacy guidance", () => {
  beforeEach(() => { state.selection = null; state.stored = null; load.mockReset(); });

  it("loads only once, retaining the frozen selection when live approval changes", async () => {
    load.mockResolvedValueOnce(selection).mockResolvedValue({ ...selection, corpusQualitySection: ["new approval"] });
    expect(await freezeLegacyGuidance(scope)).toEqual(selection);
    expect(await freezeLegacyGuidance(scope)).toEqual(selection);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])("stores safe identity only for the effective request (delivered=%s)", async delivered => {
    await recordLegacyGuidanceApplication({ ...scope, selection, callName: "initial", prompt: delivered ? selection.corpusQualitySection.join("\n") : "Prompt without orientation" });
    expect(state.stored).toBeInstanceOf(SQL);
    const query = new PgDialect().sqlToQuery(state.stored as SQL);
    const [application] = JSON.parse(query.params[0]);
    expect(application).toEqual({
      callId: expect.any(String), callName: "initial", consumer: "legacy_derivation", role: "legacy_derivation",
      situation: delivered ? "applied" : "no_guidance", fixedPromptVersion: "unknown",
      appliedRefs: delivered ? [ref] : [], setHash: delivered ? hashGuidanceSet([ref]) : null,
    });
    expect(query.params[0]).not.toContain("Literal approved text");
    expect(query.params[0]).not.toContain("Prompt without orientation");
  });
});
