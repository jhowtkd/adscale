import { getCreativeWork } from "@/server/repositories/creative-work";
import { insertVisualRecipe } from "@/server/repositories/visual-recipe";
import { extractVisualRecipe } from "@/server/creative-work/visual-recipe";
import type { VisualRecipe } from "@/server/db/schema";

export type SaveVisualRecipeInput = {
  workspaceId: string;
  workItemId: string;
  outputId: string;
};

export type SaveVisualRecipeError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_selected" }
  | { code: "raster_only" }
  | { code: "unsupported_layout" }
  | { code: "missing_logo_geometry" }
  | { code: "missing_font" }
  | { code: "brand_required" };

export async function saveVisualRecipeFromOutput(
  input: SaveVisualRecipeInput,
): Promise<{ ok: true; value: { recipe: VisualRecipe } } | { ok: false; error: SaveVisualRecipeError }> {
  const existing = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!existing) return { ok: false, error: { code: "work_not_found" } };

  const output = existing.outputs.find((row) => row.id === input.outputId);
  if (!output) return { ok: false, error: { code: "output_not_found" } };

  const extracted = extractVisualRecipe({
    workId: existing.work.id,
    outputId: output.id,
    clientProfileId: existing.work.clientProfileId,
    isSelected: output.isSelected,
    format: output.targetFormat,
    quality: output.quality,
  });
  if (!extracted.ok) return { ok: false, error: { code: extracted.error } };

  const recipe = await insertVisualRecipe({
    workspaceId: input.workspaceId,
    clientProfileId: existing.work.clientProfileId,
    document: extracted.recipe,
  });
  return { ok: true, value: { recipe } };
}
