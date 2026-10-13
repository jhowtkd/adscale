import { getSharedSkillsFingerprint } from "@/server/shared-skills";

/** Headers use the base; records keep the complete version captured for the call. */
export function getEquipePromptVersion(taskKind: string): { base: string; effective: string } {
  const base = taskKind === "diagnosis" ? "equipe-diagnosis/v2"
    : taskKind === "strategist_turn" ? "equipe-prompts/v8" : "equipe-prompts/v7";
  return { base, effective: `${base}+${getSharedSkillsFingerprint()}` };
}
