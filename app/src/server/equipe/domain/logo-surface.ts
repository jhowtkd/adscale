// The plate a brand logo is shown on (ticket 16).
//
// A logo with a transparent background has no color of its own behind it: wherever we show it on a flat background of ours, a light logo (the owner's has
// its first word in white) needs a dark one, or part of it is gone. The server measures the logo once, when it is stored (`handoff/logo-surface.ts`), and
// keeps the answer with the asset (`metadata.surface`) and with the handoff item. Everything that shows or reads the logo takes the plate from here, so
// the plate the mesa paints and the one the measurement judges against are the same colors.

/** What a logo asks for: `dark` when it has light ink that would vanish on the light plate, `light` otherwise (the plate the mesa always had). */
export const LOGO_SURFACES = ["dark", "light"] as const;
export type LogoSurface = (typeof LOGO_SURFACES)[number];

/** The surface a stored value names, or `undefined` for anything else (a logo stored before the measurement, or a value nobody wrote). Never throws. */
export function parseLogoSurface(value: unknown): LogoSurface | undefined {
  return value === "dark" || value === "light" ? value : undefined;
}

/**
 * The plates, as the mesa paints them: the cream of the logo card it always had, and the graphite of its palette card (colors the v4 reference already uses).
 * Gradients, so the measurement takes the mean of the two ends.
 */
export const LOGO_PLATES = {
  light: { angle: 160, from: "#f6f1e8", to: "#e9e1d4" },
  dark: { angle: 170, from: "#17191d", to: "#101115" },
} as const satisfies Record<LogoSurface, { angle: number; from: string; to: string }>;

/** The CSS background of a plate. A value that is not a surface (it came from stored data, not from a type) gets the light plate, the one the mesa always had. */
export const logoPlateBackground = (surface: LogoSurface) => {
  const { angle, from, to } = LOGO_PLATES[parseLogoSurface(surface) ?? "light"];
  return `linear-gradient(${angle}deg,${from},${to})`;
};

/**
 * The flat color the copy of a logo that the vision reads is flattened on. A logo that asks for `light` (or says nothing) keeps the white the copy always had, so
 * its call is the same as before; one that asks for `dark` is flattened on the graphite of the dark plate, so its light ink is in the picture the model reads.
 */
export const LOGO_VISION_BACKDROP = { light: "#ffffff", dark: LOGO_PLATES.dark.from } as const satisfies Record<LogoSurface, string>;
