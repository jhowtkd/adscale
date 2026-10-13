import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { derivations } from "../db/schema";
import { hashGuidanceSet, type LearnedGuidanceRef } from "./learned-guidance";
import { loadPromptCalibrationContext, type PromptCalibrationContext } from "./prompt-calibration-loader";

export interface LegacyGuidanceApplication {
  callId: string;
  callName: string;
  consumer: "legacy_derivation";
  role: "legacy_derivation";
  appliedRefs: LearnedGuidanceRef[];
  setHash: string | null;
  fixedPromptVersion: "unknown";
  situation: "applied" | "no_guidance";
}

export async function freezeLegacyGuidance(input: {
  workspaceId: string;
  derivationId: string;
  clientProfileId: string | null;
}): Promise<PromptCalibrationContext> {
  return db.transaction(async tx => {
    const scope = and(eq(derivations.id, input.derivationId), eq(derivations.workspaceId, input.workspaceId));
    const [row] = await tx.select({ selection: derivations.frozenLegacyGuidance }).from(derivations).where(scope).for("update");
    if (!row) throw new Error("Execução de derivação não encontrada neste workspace.");
    if (row.selection) return row.selection;
    const selection = await loadPromptCalibrationContext(input);
    await tx.update(derivations).set({ frozenLegacyGuidance: selection }).where(scope);
    return selection;
  });
}

export async function recordLegacyGuidanceApplication(input: {
  workspaceId: string;
  derivationId: string;
  selection: PromptCalibrationContext;
  callName: string;
  prompt: string;
}): Promise<void> {
  const { selection, prompt } = input;
  const deliveredIds = [
    ...(selection.brandTasteSection.length && prompt.includes(selection.brandTasteSection.join("\n")) ? selection.appliedBrandRuleIds : []),
    ...(selection.corpusQualitySection.length && prompt.includes(selection.corpusQualitySection.join("\n")) ? selection.appliedCorpusRuleIds : []),
  ];
  const appliedRefs = selection.appliedRefs.filter(ref => deliveredIds.includes(ref.ruleId));
  const application: LegacyGuidanceApplication = {
    callId: randomUUID(),
    callName: input.callName,
    consumer: "legacy_derivation",
    role: "legacy_derivation",
    appliedRefs,
    setHash: hashGuidanceSet(appliedRefs),
    fixedPromptVersion: "unknown",
    situation: appliedRefs.length ? "applied" : "no_guidance",
  };
  const [row] = await db.update(derivations).set({
    legacyGuidanceApplications: sql`coalesce(${derivations.legacyGuidanceApplications}, '[]'::jsonb) || ${JSON.stringify([application])}::jsonb`,
  }).where(and(eq(derivations.id, input.derivationId), eq(derivations.workspaceId, input.workspaceId)))
    .returning({ id: derivations.id });
  if (!row) throw new Error("Execução de derivação não encontrada neste workspace.");
}
