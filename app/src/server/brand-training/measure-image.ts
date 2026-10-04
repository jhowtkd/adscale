import { processRaster } from "@/server/equipe/handoff/raster-image";

/** Versioned deterministic metrics attached to brand-training analysis. */
export const DETERMINISTIC_MEASUREMENT_VERSION = 1 as const;

export interface ColorTarget {
  /** sRGB hex like #071522 */
  hex: string;
  /** Optional label for the target (e.g. "navy"). */
  label?: string;
}

export interface ColorCoverage {
  hex: string;
  label?: string;
  /** Percentage of opaque pixels matching this color within ΔE tolerance. */
  coveragePercent: number;
}

export interface RegionStats {
  /** 0–1 normalized region bounds. */
  x: number;
  y: number;
  width: number;
  height: number;
  meanLuminance: number;
  contrast: number;
}

export interface DeterministicImageMeasurement {
  version: typeof DETERMINISTIC_MEASUREMENT_VERSION;
  width: number;
  height: number;
  aspectRatio: number;
  orientationApplied: number | null;
  colorSpace: string | null;
  hasAlphaChannel: boolean;
  /** True only when alpha is present AND not fully opaque. */
  hasRealTransparency: boolean;
  transparentAreaPercent: number;
  colorCoverage: ColorCoverage[];
  /**
   * % of opaque pixels not assigned to any brand color (only when
   * `maxAssignDeltaE` is set, or in `within_tolerance` mode).
   */
  unassignedPercent: number;
  contentBoundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
  margins: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null;
  meanLuminance: number;
  regions: RegionStats[];
  measuredAt: string;
}

export interface MeasureImageOptions {
  /** Palette colors to measure coverage for. */
  colorTargets?: readonly ColorTarget[];
  /**
   * Color assignment mode (default `"nearest"`).
   * - `nearest`: every opaque pixel joins the closest brand color (gradients/
   *   shadows stay in-family — required for real brand pieces).
   * - `within_tolerance`: only count pixels within `deltaETolerance` of a
   *   target (old radius mode; collapses under brand gradients).
   */
  colorAssignment?: "nearest" | "within_tolerance";
  /** ΔE76 radius for `within_tolerance` mode (default 4). Ignored by `nearest`. */
  deltaETolerance?: number;
  /**
   * Optional ceiling for `nearest`: if the closest brand color is farther than
   * this ΔE, the pixel is left unassigned (counts in `unassignedPercent`).
   * Default: no ceiling — always assign.
   */
  maxAssignDeltaE?: number;
  /** Region grid (default 3 → 3×3). */
  regionGrid?: number;
  /** Clock override for tests. */
  now?: () => Date;
  accountKey?: string;
}

// --- color math (sRGB → Lab, ΔE76) — no extra deps ---

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB D65
  let x = R * 0.4124564 + G * 0.3575761 + B * 0.1804375;
  let y = R * 0.2126729 + G * 0.7151522 + B * 0.072175;
  let z = R * 0.0193339 + G * 0.119192 + B * 0.9503041;
  // D65 white
  x /= 0.95047;
  y /= 1;
  z /= 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: [number, number, number], b: [number, number, number]): number {
  const dL = a[0] - b[0];
  const dA = a[1] - b[1];
  const dB = a[2] - b[2];
  return Math.sqrt(dL * dL + dA * dA + dB * dB);
}

export function colorDeltaE(first: string, second: string): number | null {
  const a = parseHexColor(first);
  const b = parseHexColor(second);
  return a && b
    ? deltaE76(rgbToLab(a.r, a.g, a.b), rgbToLab(b.r, b.g, b.b))
    : null;
}

export function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

/**
 * Pure deterministic image measurement. Buffer in → numbers out.
 * No network, no DB, no model. Uses Sharp already in the tree.
 */
export async function measureImageBuffer(
  buffer: Buffer,
  options: MeasureImageOptions = {},
): Promise<DeterministicImageMeasurement> {
  for (const target of options.colorTargets ?? []) {
    if (!parseHexColor(target.hex)) throw new Error(`measureImageBuffer: invalid hex "${target.hex}"`);
  }
  const { data } = await processRaster(buffer, "training-measure", {
    accountKey: options.accountKey,
    measurement: {
      colorTargets: options.colorTargets,
      colorAssignment: options.colorAssignment,
      deltaETolerance: options.deltaETolerance,
      maxAssignDeltaE: options.maxAssignDeltaE,
      regionGrid: options.regionGrid,
    },
  });
  return { ...JSON.parse(data.toString("utf8")), measuredAt: (options.now ?? (() => new Date()))().toISOString() };
}
