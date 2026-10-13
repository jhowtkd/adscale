import type { GuidanceRole, LearnedGuidanceRef } from "../brand-taste/learned-guidance";

/** Metadata copied from a persisted application, never from current rules or skills. */
export interface GenerationIdentityApplication {
  role: GuidanceRole;
  appliedRefs: LearnedGuidanceRef[];
  setHash: string | null;
  fixedPromptVersion: string;
}
export type GenerationIdentity =
  | { state: "unknown"; applications: [] }
  | { state: "recorded"; applications: GenerationIdentityApplication[] };

export const GENERATION_ROLE_LABELS: Record<GuidanceRole, string> = {
  copy: "Redação", art_direction: "Direção de arte", image_prompt: "Prompt de imagem",
  carousel_editorial: "Editorial do carrossel", caption_adjustment: "Ajuste de legenda",
  strategist: "Estrategista", legacy_derivation: "Derivação legada",
};
const unknown = (): GenerationIdentity => ({ state: "unknown", applications: [] });
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9_./:+-]{1,160}$/.test(value) && !value.includes("://");

/** Strict projection: extra nested keys cannot carry text, URLs or provider data. */
export function snapshotGenerationIdentity(value: unknown): GenerationIdentity {
  if (!Array.isArray(value) || !value.length || value.length > 100) return unknown();
  const applications: GenerationIdentityApplication[] = [];
  for (const item of value) {
    if (!object(item) || typeof item.role !== "string" || !Object.hasOwn(GENERATION_ROLE_LABELS, item.role)
      || !identifier(item.fixedPromptVersion) || !(item.setHash === null || hash(item.setHash))
      || !Array.isArray(item.appliedRefs) || item.appliedRefs.length > 5) return unknown();
    const appliedRefs: LearnedGuidanceRef[] = [];
    for (const ref of item.appliedRefs) {
      if (!object(ref) || !identifier(ref.ruleId) || !hash(ref.contentHash)
        || !(ref.revision === "legacy" || (typeof ref.revision === "number" && Number.isSafeInteger(ref.revision) && ref.revision > 0))) return unknown();
      appliedRefs.push({ ruleId: ref.ruleId, revision: ref.revision as number | "legacy", contentHash: ref.contentHash });
    }
    applications.push({ role: item.role as GuidanceRole, appliedRefs, setHash: item.setHash as string | null, fixedPromptVersion: item.fixedPromptVersion });
  }
  return { state: "recorded", applications };
}

/** Historical absence is unknown even if the Peça has gained a record later. */
export function readGenerationIdentity(value: unknown): GenerationIdentity {
  return object(value) && value.state === "recorded" ? snapshotGenerationIdentity(value.applications) : unknown();
}
