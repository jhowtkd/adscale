"use client"

import { useState, useEffect } from "react"

/**
 * Hook to detect scroll direction
 * Returns: "up" | "down" | null (when not scrolled)
 */
export function useScrollDirection(): "up" | "down" | null {
  const [scrollDirection, setScrollDirection] = useState<"up" | "down" | null>(null)
  const [lastScrollY, setLastScrollY] = useState(0)

  useEffect(() => {
    const updateScrollDirection = () => {
      const scrollY = window.scrollY
      const direction = scrollY > lastScrollY ? "down" : "up"
      
      if (
        direction !== scrollDirection &&
        (scrollY - lastScrollY > 10 || scrollY - lastScrollY < -10)
      ) {
        setScrollDirection(direction)
      }
      setLastScrollY(scrollY > 0 ? scrollY : 0)
    }

    window.addEventListener("scroll", updateScrollDirection, { passive: true })
    return () => window.removeEventListener("scroll", updateScrollDirection)
  }, [scrollDirection, lastScrollY])

  return scrollDirection
}
