"use client"

import { m } from "@/components/animations/MotionBoundary"
import { ReactNode } from "react"
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion"
import { staggerContainer, staggerItem } from "@/lib/animations/variants"

interface StaggerContainerProps {
  children: ReactNode
  className?: string
  staggerDelay?: number
  delayChildren?: number
}

/**
 * StaggerContainer - animates children with staggered entrance
 * Automatically respects reduced motion preference
 */
export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.05,
  delayChildren = 0.1,
}: StaggerContainerProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
            delayChildren,
          },
        },
      }}
      className={className}
    >
      {children}
    </m.div>
  )
}

interface StaggerItemProps {
  children: ReactNode
  className?: string
}

/**
 * StaggerItem - individual item within a StaggerContainer
 */
export function StaggerItem({ children, className }: StaggerItemProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  return (
    <m.div variants={staggerItem} className={className}>
      {children}
    </m.div>
  )
}
