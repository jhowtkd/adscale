import { z } from "zod";

export const imageRenderPolicySchema = z
  .object({
    version: z.literal(1),
    model: z.enum([
      "gpt-image-2",
      "gpt-image-2-2026-04-21",
      "gpt-image-2.5-sunburst-2026-09-08",
    ]),
    quality: z.enum(["medium", "high", "xhigh", "max"]),
  })
  .strict()
  .refine(
    (value) =>
      value.model === "gpt-image-2.5-sunburst-2026-09-08" ||
      ["medium", "high"].includes(value.quality),
    "Image 2 does not support xhigh/max",
  );

export type ImageRenderPolicy = z.infer<typeof imageRenderPolicySchema>;

export const LEGACY_IMAGE_POLICY: ImageRenderPolicy = {
  version: 1,
  model: "gpt-image-2-2026-04-21",
  quality: "medium",
};

export function resolveImageRenderPolicy(value: unknown): ImageRenderPolicy {
  return imageRenderPolicySchema.parse(value === undefined ? LEGACY_IMAGE_POLICY : value);
}

export function selectImageRenderPolicy(
  workspaceId: string,
  percentage: number,
  quality: ImageRenderPolicy["quality"],
): ImageRenderPolicy {
  z.number().int().min(0).max(100).parse(percentage);
  let hash = 2166136261;
  for (const character of `sunburst-v1:${workspaceId}`) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  }
  const bucket = (hash >>> 0) % 100;
  return imageRenderPolicySchema.parse(
    bucket < percentage
      ? { version: 1, model: "gpt-image-2.5-sunburst-2026-09-08", quality }
      : LEGACY_IMAGE_POLICY,
  );
}
