// Pesquisa IA: the free brand diagnosis. One structured call over PUBLIC text
// (site / confirmed Instagram); the answer is verified and stored by the
// module (handoff/diagnosis.ts), never trusted as it comes.

import { withTextInputBound } from "./free-budget";
import { EquipeModelRefusalError, EquipeModelTruncatedError, type EquipeModelClient, type ModelCallUsage } from "./model-client";
import type { EquipeEffort } from "./provider";
import { diagnosisSystemPrompt, diagnosisUserMessage } from "./prompts";
import { resolveResearchEffort, resolveResearchModel } from "./roles";
import { diagnosisModelOutputSchema, type DiagnosisInput, type DiagnosisModelOutput } from "../handoff/diagnosis-contract";

/**
 * Reasoning tokens count toward the output limit: room for both. 20,000 (it was 16,000, like the other Pesquisa tasks): the real test of 01/10 had one
 * diagnosis use 14,850 of 16,000 (93%) and a longer site could be cut (`model_truncated`, another attempt, another charge). 20,000 leaves 35% of room over
 * that worst case, still finishes inside `DIAGNOSIS_TIMEOUT_MS` at the measured ~95 tokens/s (20,000 / 95 = 210 s < 240 s) and keeps one attempt's
 * admission maximum at 1 cent, so the 10-cent reserve does not change. The real run must confirm that Muse takes 20,000 (16,000 was exercised).
 */
export const DIAGNOSIS_MAX_TOKENS = 20_000;
/** A single free attempt holds the account's AI lock: a stuck provider must not block the chat for minutes. */
export const DIAGNOSIS_TIMEOUT_MS = 240_000;

export type DiagnosisRunInput = {
  client: EquipeModelClient;
  diagnosis: DiagnosisInput;
  model?: string;
  effort?: EquipeEffort;
  onModelCall?: (call: ModelCallUsage) => Promise<void>;
};

export async function runDiagnosis(input: DiagnosisRunInput): Promise<DiagnosisModelOutput> {
  const model = input.model ?? resolveResearchModel();
  const effort = input.effort ?? resolveResearchEffort();
  const response = await input.client.chat(withTextInputBound({
    model,
    messages: [
      { role: "system", content: diagnosisSystemPrompt() },
      { role: "user", content: diagnosisUserMessage(input.diagnosis) },
    ],
    output: { name: "equipe_diagnosis", schema: diagnosisModelOutputSchema },
    effort,
    maxTokens: DIAGNOSIS_MAX_TOKENS,
    timeoutMs: DIAGNOSIS_TIMEOUT_MS,
  }));
  await input.onModelCall?.({ model, ...response.usage });
  // A cut or refused answer is a failed task, never parsed as a diagnosis.
  if (response.stopReason === "refusal") throw new EquipeModelRefusalError("diagnosis_refused");
  if (response.stopReason === "max_tokens") throw new EquipeModelTruncatedError("diagnosis_truncated");
  let parsed: unknown;
  try { parsed = JSON.parse(response.content ?? "null"); }
  catch { throw new Error("diagnosis_invalid_json"); }
  const validated = diagnosisModelOutputSchema.safeParse(parsed);
  if (!validated.success) throw new Error(`diagnosis_schema_mismatch: ${validated.error.issues[0]?.message ?? "invalid"}`);
  return validated.data;
}
