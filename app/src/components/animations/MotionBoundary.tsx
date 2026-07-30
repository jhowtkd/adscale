"use client";

import {
  AnimatePresence,
  LazyMotion,
  domAnimation,
  animate,
  m,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "framer-motion";

export { AnimatePresence, animate, m, useReducedMotion };
export type { HTMLMotionProps, Variants };

export default function MotionBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
