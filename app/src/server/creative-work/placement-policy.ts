import type { BrandTrainingCategory } from "../brand-training/contracts";
import type { BrandAssetGravity } from "./composite";
import type { CreativeWorkIdentityAssetSnapshot } from "./contracts";

export type PriorityFormat = "1:1" | "4:5" | "9:16";

/** Per-asset, per-format placement policy (not fixed only by category). */
export interface ExactAssetPlacementPolicy {
  category: BrandTrainingCategory;
  /** Must appear when the identity includes this exact asset. */
  required: boolean;
  /** May be skipped when space/contrast fails (recorded in provenance). */
  omissible: boolean;
  preferredGravity: BrandAssetGravity;
  allowedGravities: readonly BrandAssetGravity[];
  preferredWidthRatio: number;
  minWidthRatio: number;
  maxWidthRatio: number;
  /** Edge inset as a fraction of the shorter canvas side. */
  clearspaceRatio: number;
  /** Minimum relative-luminance contrast between logo and underlay. */
  minContrast: number;
}

export interface CompositionLayerPlan {
  referenceId: string;
  assetKey: string;
  label: string;
  category: BrandTrainingCategory;
  gravity: BrandAssetGravity;
  widthRatio: number;
  clearspacePx: number;
  policy: ExactAssetPlacementPolicy;
  status: "compose" | "omit";
  reason: string;
  contrast?: number;
  usedBackdrop?: boolean;
  box?: { left: number; top: number; width: number; height: number };
  sourceSha256?: string;
}

export interface CompositionProvenance {
  version: 1;
  format: string;
  dimensions: { width: number; height: number };
  baseHash?: string;
  outputHash?: string;
  composed: Array<{
    referenceId: string;
    assetKey: string;
    label: string;
    category: BrandTrainingCategory;
    gravity: BrandAssetGravity;
    widthRatio: number;
    clearspacePx: number;
    contrast: number | null;
    usedBackdrop: boolean;
    box: { left: number; top: number; width: number; height: number } | null;
    sourceSha256?: string;
    policy: {
      required: boolean;
      omissible: boolean;
      preferredGravity: BrandAssetGravity;
      minContrast: number;
    };
  }>;
  omitted: Array<{
    referenceId: string;
    assetKey: string;
    label: string;
    reason: string;
  }>;
  blocked: Array<{
    referenceId: string;
    assetKey: string;
    label: string;
    reason: string;
  }>;
}

const CORNER_GRAVITIES: readonly BrandAssetGravity[] = [
  "southwest",
  "southeast",
  "northwest",
  "northeast",
];

/**
 * Format-aware defaults. Logo stays small with clearspace; graphics can grow
 * on taller canvases. Policy is looked up by (category, format), not category alone.
 */
export function policyForExactAsset(
  category: BrandTrainingCategory,
  format: string,
): ExactAssetPlacementPolicy | null {
  if (category === "visual_reference" || category === "person") return null;

  const tall = format === "9:16";
  const square = format === "1:1";

  if (category === "logo") {
    return {
      category,
      required: true,
      omissible: false,
      preferredGravity: "southwest",
      allowedGravities: CORNER_GRAVITIES,
      preferredWidthRatio: square ? 0.2 : tall ? 0.22 : 0.2,
      minWidthRatio: 0.12,
      maxWidthRatio: 0.28,
      clearspaceRatio: tall ? 0.04 : 0.035,
      minContrast: 1.6,
    };
  }

  if (category === "graphic") {
    return {
      category,
      required: false,
      omissible: true,
      preferredGravity: "northwest",
      allowedGravities: ["northwest", "northeast", "southwest", "southeast"],
      preferredWidthRatio: tall ? 0.38 : 0.32,
      minWidthRatio: 0.15,
      maxWidthRatio: 0.45,
      clearspaceRatio: 0.03,
      minContrast: 1.4,
    };
  }

  // character
  return {
    category,
    required: false,
    omissible: true,
    preferredGravity: "southeast",
    allowedGravities: ["southeast", "southwest", "northeast", "northwest"],
    preferredWidthRatio: tall ? 0.4 : 0.36,
    minWidthRatio: 0.18,
    maxWidthRatio: 0.5,
    clearspaceRatio: 0.03,
    minContrast: 1.4,
  };
}

export function clampWidthRatio(
  value: number,
  policy: ExactAssetPlacementPolicy,
): number {
  if (!Number.isFinite(value)) return policy.preferredWidthRatio;
  return Math.min(policy.maxWidthRatio, Math.max(policy.minWidthRatio, value));
}

export function clearspacePx(
  dimensions: { width: number; height: number },
  policy: ExactAssetPlacementPolicy,
): number {
  const short = Math.min(dimensions.width, dimensions.height);
  return Math.max(0, Math.round(short * policy.clearspaceRatio));
}

/** Relative luminance (sRGB), 0–1. */
export function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Axis-aligned box of a layer after resize, for a gravity + clearspace.
 * Used for contrast sampling and for sharp left/top placement.
 */
export function layerBox(input: {
  gravity: BrandAssetGravity;
  canvas: { width: number; height: number };
  layer: { width: number; height: number };
  clearspacePx: number;
}): { left: number; top: number; width: number; height: number } {
  const { gravity, canvas, layer, clearspacePx: pad } = input;
  const maxLeft = Math.max(pad, canvas.width - layer.width - pad);
  const maxTop = Math.max(pad, canvas.height - layer.height - pad);
  const centerLeft = Math.round((canvas.width - layer.width) / 2);
  const centerTop = Math.round((canvas.height - layer.height) / 2);

  switch (gravity) {
    case "northwest":
      return { left: pad, top: pad, width: layer.width, height: layer.height };
    case "northeast":
      return { left: maxLeft, top: pad, width: layer.width, height: layer.height };
    case "southwest":
      return { left: pad, top: maxTop, width: layer.width, height: layer.height };
    case "southeast":
      return { left: maxLeft, top: maxTop, width: layer.width, height: layer.height };
    case "center":
      return {
        left: Math.min(maxLeft, Math.max(pad, centerLeft)),
        top: Math.min(maxTop, Math.max(pad, centerTop)),
        width: layer.width,
        height: layer.height,
      };
  }
}

/**
 * Pre-provider gate: required exact assets must have alpha and a feasible size.
 * Does not need the generated image.
 */
export function preflightExactComposition(input: {
  format: string;
  dimensions: { width: number; height: number };
  assets: readonly CreativeWorkIdentityAssetSnapshot[];
  /** Decoded source dimensions from the binary preflight when available. */
  inspectedAssets?: ReadonlyMap<string, { width: number; height: number }>;
  /** Callers that can persist pre-provider omissions may opt into them. */
  reportOmissions?: boolean;
}): { ok: true; omitted?: CompositionProvenance["omitted"] } | { ok: false; blocked: CompositionProvenance["blocked"] } {
  const blocked: CompositionProvenance["blocked"] = [];
  const omitted: CompositionProvenance["omitted"] = [];
  const exact = input.assets.filter((a) => a.usageMode === "exact");

  for (const asset of exact) {
    const policy = policyForExactAsset(asset.category, input.format);
    if (!policy) continue;

    if (!asset.hasAlpha) {
      const result = {
        referenceId: asset.referenceId,
        assetKey: asset.assetKey,
        label: asset.label,
        reason: "exact_asset_missing_alpha",
      } as const;
      if (policy.omissible) omitted.push(result);
      else blocked.push(result);
      continue;
    }

    const widthRatio = clampWidthRatio(
      asset.placement?.widthRatio ?? policy.preferredWidthRatio,
      policy,
    );
    const targetW = Math.round(input.dimensions.width * widthRatio);
    const inspection = input.inspectedAssets?.get(asset.assetKey);
    const targetH = inspection
      ? Math.round(targetW * (inspection.height / inspection.width))
      : null;
    const pad = clearspacePx(input.dimensions, policy);
    // Width is controlled by the category policy; the decoded aspect ratio is
    // equally material. A very tall transparent seal can otherwise pass the
    // metadata gate and become impossible only after a paid generation.
    if (
      targetW < 8
      || (targetH !== null && (!Number.isFinite(targetH) || targetH + pad * 2 > input.dimensions.height))
    ) {
      const result = {
          referenceId: asset.referenceId,
          assetKey: asset.assetKey,
          label: asset.label,
          reason: "exact_asset_no_space",
        } as const;
      if (policy.omissible) omitted.push(result);
      else blocked.push(result);
    }
  }

  if (blocked.length > 0) return { ok: false, blocked };
  return input.reportOmissions && omitted.length > 0 ? { ok: true, omitted } : { ok: true };
}

export function buildStaticComposePlan(input: {
  format: string;
  dimensions: { width: number; height: number };
  assets: readonly CreativeWorkIdentityAssetSnapshot[];
}): {
  layers: CompositionLayerPlan[];
  omitted: CompositionProvenance["omitted"];
  blocked: CompositionProvenance["blocked"];
} {
  const layers: CompositionLayerPlan[] = [];
  const omitted: CompositionProvenance["omitted"] = [];
  const blocked: CompositionProvenance["blocked"] = [];
  const pre = preflightExactComposition({ ...input, reportOmissions: true });
  if (!pre.ok) {
    return { layers: [], omitted: [], blocked: pre.blocked };
  }
  omitted.push(...(pre.omitted ?? []));
  const preflightOmittedKeys = new Set(omitted.map((entry) => entry.assetKey));

  for (const asset of input.assets) {
    if (asset.usageMode !== "exact") continue;
    if (preflightOmittedKeys.has(asset.assetKey)) continue;
    const policy = policyForExactAsset(asset.category, input.format);
    if (!policy) continue;

    const widthRatio = clampWidthRatio(
      asset.placement?.widthRatio ?? policy.preferredWidthRatio,
      policy,
    );
    const pad = clearspacePx(input.dimensions, policy);
    const preferred =
      asset.placement?.gravity &&
      policy.allowedGravities.includes(asset.placement.gravity)
        ? asset.placement.gravity
        : policy.preferredGravity;

    layers.push({
      referenceId: asset.referenceId,
      assetKey: asset.assetKey,
      label: asset.label,
      category: asset.category,
      gravity: preferred,
      widthRatio,
      clearspacePx: pad,
      policy,
      status: "compose",
      reason: "policy_default",
    });
  }

  return { layers, omitted, blocked };
}

export function toProvenance(input: {
  format: string;
  dimensions: { width: number; height: number };
  layers: CompositionLayerPlan[];
  omitted: CompositionProvenance["omitted"];
  blocked: CompositionProvenance["blocked"];
  baseHash?: string;
  outputHash?: string;
}): CompositionProvenance {
  return {
    version: 1,
    format: input.format,
    dimensions: input.dimensions,
    ...(input.baseHash ? { baseHash: input.baseHash } : {}),
    ...(input.outputHash ? { outputHash: input.outputHash } : {}),
    composed: input.layers
      .filter((l) => l.status === "compose")
      .map((l) => ({
        referenceId: l.referenceId,
        assetKey: l.assetKey,
        label: l.label,
        category: l.category,
        gravity: l.gravity,
        widthRatio: l.widthRatio,
        clearspacePx: l.clearspacePx,
        contrast: l.contrast ?? null,
        usedBackdrop: l.usedBackdrop ?? false,
        box: l.box ?? null,
        ...(l.sourceSha256 ? { sourceSha256: l.sourceSha256 } : {}),
        policy: {
          required: l.policy.required,
          omissible: l.policy.omissible,
          preferredGravity: l.policy.preferredGravity,
          minContrast: l.policy.minContrast,
        },
      })),
    omitted: input.omitted,
    blocked: input.blocked,
  };
}
