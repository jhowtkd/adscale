"use client"

import { m, type HTMLMotionProps } from "@/components/animations/MotionBoundary"
import { ReactNode } from "react"
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion"
import { fadeInUp, fadeIn, fadeInDown, scaleIn, slideInLeft, slideInRight } from "@/lib/animations/variants"

type AnimationType = "fadeIn" | "fadeInUp" | "fadeInDown" | "scaleIn" | "slideInLeft" | "slideInRight"

const variants = {
  fadeIn,
  fadeInUp,
  fadeInDown,
  scaleIn,
  slideInLeft,
  slideInRight,
}

interface FadeInProps extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode
  animation?: AnimationType
  delay?: number
  duration?: number
  className?: string
}

/**
 * FadeIn wrapper component - animates children on mount
 * Automatically respects reduced motion preference
 */
export function FadeIn({
  children,
  animation = "fadeInUp",
  delay = 0,
  duration,
  className,
  ...props
}: FadeInProps) {
  const reducedMotion = useReducedMotion()

  if (reducedMotion) {
    return <div className={className}>{children}</div>
  }

  const selectedVariant = variants[animation]

  return (
    <m.div
      initial="hidden"
      animate="visible"
      variants={selectedVariant}
      transition={delay ? { delay, duration } : duration ? { duration } : undefined}
      className={className}
      {...props}
    >
      {children}
    </m.div>
  )
}
