/** Custom easing curves for consistent animations */
export const easings = {
  /** Standard ease-out for UI transitions */
  easeOut: [0, 0, 0.2, 1] as const,
  /** Ease-in-out for symmetrical animations */
  easeInOut: [0.4, 0, 0.2, 1] as const,
  /** Expo ease-out for snappy UI */
  easeOutExpo: [0.16, 1, 0.3, 1] as const,
  /** Spring-like bounce for playful interactions */
  spring: { type: "spring" as const, stiffness: 400, damping: 30 },
  /** Gentle spring for subtle movements */
  gentleSpring: { type: "spring" as const, stiffness: 300, damping: 25 },
}

/** Duration presets in seconds */
export const durations = {
  /** Fast transitions (hover, focus) */
  fast: 0.15,
  /** Normal transitions (state changes) */
  normal: 0.2,
  /** Slow transitions (page/section transitions) */
  slow: 0.3,
  /** Very slow (modals, drawers) */
  verySlow: 0.4,
}

/** CSS custom properties for design system alignment */
const cssEasings = {
  easeOut: "cubic-bezier(0, 0, 0.2, 1)",
  easeInOut: "cubic-bezier(0.4, 0, 0.2, 1)",
  easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
}
