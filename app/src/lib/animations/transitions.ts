import { Transition } from "framer-motion"
import { easings, durations } from "./easings"

/** Default transition for most UI animations */
export const defaultTransition: Transition = {
  duration: durations.normal,
  ease: easings.easeOutExpo,
}

/** Fast transition for hover states */
export const fastTransition: Transition = {
  duration: durations.fast,
  ease: easings.easeOut,
}

/** Slow transition for page/section transitions */
export const slowTransition: Transition = {
  duration: durations.slow,
  ease: easings.easeOutExpo,
}

/** Spring transition for interactive elements */
export const springTransition: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
}
