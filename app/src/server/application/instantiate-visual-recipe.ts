import { projectCreativeWorkAsCanonicalWork } from "@/server/creative-work/projection/from-creative-work";
import {
  applyAuthorizedFields,
  assertRecipeBrand,
  freezeVisualRecipeSnapshot,
  visualRecipeOrigin,
} from "@/server/creative-work/visual-recipe";
import type { SocialPostCopy } from "@/server/creative-work/contracts";
import { deriveCreativeWorkTitle } from "@/server/creative-work/prepare";
import {
  createCreativeWorkDraft,
  setCreativeWorkCopy,
} from "@/server/repositories/creative-work";
import { getVisualRecipeInWorkspace } from "@/server/repositories/visual-recipe";
import type { CreativeWorkItem } from "@/server/db/schema";

export type InstantiateVisualRecipeInput = {
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  draftKey: string;
  recipeId: string;
  fields?: Partial<SocialPostCopy>;
};

export type InstantiateVisualRecipeError =
  | { code: "recipe_not_found" }
  | { code: "brand_mismatch" }
  | { code: "client_profile_not_found" };

export async function instantiateVisualRecipe(
  input: InstantiateVisualRecipeInput,
): Promise<
  | { ok: true; value: { work: CreativeWorkItem; recipeVersion: number } }
  | { ok: false; error: InstantiateVisualRecipeError }
> {
  const stored = await getVisualRecipeInWorkspace(input.workspaceId, input.recipeId);
  if (!stored) return { ok: false, error: { code: "recipe_not_found" } };

  const brand = assertRecipeBrand({
    recipeBrandId: stored.clientProfileId,
    requestedBrandId: input.clientProfileId,
  });
  if (!brand.ok) return { ok: false, error: { code: "brand_mismatch" } };

  const applied = applyAuthorizedFields(stored.document, input.fields ?? {});
  const origin = visualRecipeOrigin({
    recipeId: stored.id,
    version: stored.version,
    originWorkId: stored.document.originWorkId,
    originOutputId: stored.document.originOutputId,
  });

  const work = await createCreativeWorkDraft({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    createdByUserId: input.userId,
    draftKey: input.draftKey,
    intent: "single",
    title: deriveCreativeWorkTitle(applied.fields.headline),
    request: applied.fields.headline,
    format: applied.format,
    settings: {
      targetFormats: [applied.format],
      textLayout: applied.layout,
      fontAssetKey: applied.fontAssetKey,
    },
    brief: null,
    inputSnapshot: {
      request: applied.fields.headline,
      settings: {
        targetFormats: [applied.format],
        textLayout: applied.layout,
        fontAssetKey: applied.fontAssetKey,
      },
      sources: [],
      typographyPlan: {
        version: 1,
        format: applied.format,
        requestedLayout: applied.layout,
        overflowPolicy: {
          strategy: "autofit_then_fail",
          minimumDpi: { headline: 96, body: 72, cta: 72 },
        },
        collisionPolicy: "relocate_layout_then_fail",
        contrastPolicy: "brand_plate_wcag_aa",
        safeAreaPolicy: "format_default",
        execution: "deterministic",
        fontAssetKey: applied.fontAssetKey,
        fontSelection: "operator_selected",
      },
      visualRecipe: freezeVisualRecipeSnapshot({ origin, recipe: applied }),
    },
  });
  if (!work) return { ok: false, error: { code: "client_profile_not_found" } };

  const withCopy = await setCreativeWorkCopy(input.workspaceId, work.id, applied.fields);
  return { ok: true, value: { work: withCopy ?? work, recipeVersion: stored.version } };
}

export function projectInstantiatedRecipe(work: CreativeWorkItem) {
  return projectCreativeWorkAsCanonicalWork(work, []);
}
