import { describe, expect, it } from "vitest";
import {
  createGenerationLog,
  finalizeGenerationLog,
} from "@/server/ai/generation-log";

describe("finalizeGenerationLog provenance", () => {
  it("includes appliedBrandRuleIds and appliedCorpusRuleIds in patch", () => {
    const log = createGenerationLog("camp-1", "deriv-1");

    const finalized = finalizeGenerationLog(log, {
      model: "gpt-image-1",
      appliedBrandRuleIds: ["brand-rule-1", "brand-rule-2"],
      appliedCorpusRuleIds: ["corpus-rule-1"],
    });

    expect(finalized.appliedBrandRuleIds).toEqual(["brand-rule-1", "brand-rule-2"]);
    expect(finalized.appliedCorpusRuleIds).toEqual(["corpus-rule-1"]);
    expect(finalized.model).toBe("gpt-image-1");
    expect(finalized.completedAt).toBeDefined();
  });

  it("merges auto-retry provenance with both ID arrays", () => {
    const log = createGenerationLog("camp-1", "deriv-1");

    const finalized = finalizeGenerationLog(
      log,
      {
        appliedBrandRuleIds: ["brand-a"],
        appliedCorpusRuleIds: ["corpus-a", "corpus-b"],
        autoRetryAttempted: true,
        autoRetryReason: "cta_missing",
      }
    );

    expect(finalized.appliedBrandRuleIds).toEqual(["brand-a"]);
    expect(finalized.appliedCorpusRuleIds).toEqual(["corpus-a", "corpus-b"]);
    expect(finalized.autoRetryAttempted).toBe(true);
    expect(finalized.autoRetryReason).toBe("cta_missing");
  });
});
