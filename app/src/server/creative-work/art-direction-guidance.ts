import type { ComposerGuidanceApplication } from "../brand-taste/composer-guidance-application";
import type { FrozenSinglePieceGuidance } from "../brand-taste/single-piece-guidance";

type Identity = Pick<ComposerGuidanceApplication, "appliedRefs" | "setHash" | "situation" | "omissionReason" | "omissions">;
export interface ArtDirectionGuidance { section: string; identity: Identity }

/** The trusted selector owns authorization, D3 proof and D5 budgets. Never reload live rules here. */
export function resolveArtDirectionGuidance(
  snapshot: FrozenSinglePieceGuidance | null | undefined,
  fixedPromptVersion: string,
  scope?: { format: string; generationMode?: string },
): ArtDirectionGuidance {
  if (!snapshot) return { section: "", identity: { appliedRefs: [], setHash: null, situation: "unknown" } };
  if (scope && (snapshot.format !== scope.format || scope.generationMode && snapshot.generationMode !== scope.generationMode)) return { section: "", identity: {
    appliedRefs: [], setHash: null, situation: "omitted", omissionReason: "scope_mismatch",
  } };
  if (snapshot.fixedPromptVersion !== fixedPromptVersion) return { section: "", identity: {
    appliedRefs: [], setHash: null, situation: "omitted", omissionReason: "fixed_prompt_version_mismatch",
  } };
  const context = snapshot.roles.art_direction;
  const section = context.lines.join("\n");
  return { section, identity: {
    appliedRefs: section ? context.appliedRefs.map(ref => ({ ...ref })) : [],
    setHash: section ? context.setHash : null,
    situation: section ? "applied" : context.omissionReason || context.omissions.length ? "omitted" : "no_guidance",
    ...(context.omissionReason ? { omissionReason: context.omissionReason } : {}),
    ...(context.omissions.length ? { omissions: context.omissions.map(omission => ({ ...omission })) } : {}),
  } };
}

/** Keep the renderer's measured block intact; empty/denied sets retain the original prompt bytes. */
export function appendArtDirectionGuidance(prompt: string, guidance: ArtDirectionGuidance): string {
  return guidance.section ? `${prompt}\n\n${guidance.section}` : prompt;
}
