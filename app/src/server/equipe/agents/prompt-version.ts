import { getSharedSkillsFingerprint } from "@/server/shared-skills";

/** Headers use the base; records keep the complete version captured for the call. */
export function getEquipePromptVersion(taskKind: string): { base: string; effective: string } {
  const base = taskKind === "plan_adjustment" ? "equipe-caption-adjustment/v1" : taskKind === "diagnosis" ? "equipe-diagnosis/v2" : "equipe-prompts/v7";
  return { base, effective: `${base}+${getSharedSkillsFingerprint()}` };
}
