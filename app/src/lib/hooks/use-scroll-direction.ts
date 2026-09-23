"use client"

import { useState, useEffect, useRef } from "react"

/**
 * Hook to detect scroll direction
 * Returns: "up" | "down" | null (when not scrolled)
 */
export function useScrollDirection(): "up" | "down" | null {
  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null)
  const lastScrollY = useRef(0)

  useEffect(() => {
    const updateScrollDirection = () => {
      const scrollY = window.scrollY
      const direction = scrollY > lastScrollY.current ? "down" : "up"
      
      if (
        Math.abs(scrollY - lastScrollY.current) > 10
      ) {
        setScrollDirection((current) => current === direction ? current : direction)
      }
      lastScrollY.current = Math.max(0, scrollY)
    }

    window.addEventListener("scroll", updateScrollDirection, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollDirection)
  }, [])

  return scrollDirection
}
