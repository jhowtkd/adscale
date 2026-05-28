import { Variants } from "framer-motion"
import { easings, durations } from "./easings"

/** Fade in from bottom */
export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
}

/** Fade in from top */
export const fadeInDown: Variants = {
  hidden: { opacity: 0, y: -12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
}

/** Simple fade in */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
}

/** Scale up with fade */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
}

/** Slide in from left */
export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
}

/** Slide in from right */
export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 20 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
}

/** Stagger children with fade in */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

/** Stagger item */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
}

/** Modal enter/exit */
export const modalOverlay: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.fast } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
}

export const modalContent: Variants = {
  hidden: { opacity: 0, scale: 0.95, y: 8 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 4,
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
}

/** Toast notification */
export const toastSlideIn: Variants = {
  hidden: { opacity: 0, x: 100, scale: 0.95 },
  visible: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { duration: durations.normal, ease: easings.easeOutExpo },
  },
  exit: {
    opacity: 0,
    x: 50,
    scale: 0.95,
    transition: { duration: durations.fast, ease: easings.easeOut },
  },
}

/** Error shake animation */
export const shake: Variants = {
  hidden: { x: 0 },
  visible: {
    x: [0, -8, 8, -8, 8, 0],
    transition: { duration: 0.4, ease: "easeInOut" },
  },
}
