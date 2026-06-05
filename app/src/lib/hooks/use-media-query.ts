"use client"

import { useSyncExternalStore } from "react"

function subscribeToMediaQuery(query: string, onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return () => undefined
  }
  const mediaQuery = window.matchMedia(query)
  mediaQuery.addEventListener("change", onChange)
  return () => mediaQuery.removeEventListener("change", onChange)
}

function getMediaQuerySnapshot(query: string) {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false
  }
  return window.matchMedia(query).matches
}

function getMediaQueryServerSnapshot() {
  return false
}

/**
 * Hook to listen to CSS media queries
 * @param query - CSS media query string (e.g. "(max-width: 768px)")
 * @returns boolean indicating if media query matches
 */
function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeToMediaQuery(query, onChange),
    () => getMediaQuerySnapshot(query),
    getMediaQueryServerSnapshot
  )
}

/** Predefined breakpoints matching Tailwind defaults */
const breakpoints = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
}

/** Hook for mobile breakpoint (< 768px) */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)")
}

/** Hook for tablet breakpoint (768px - 1023px) */
function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)")
}

/** Hook for desktop breakpoint (>= 1024px) */
function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)")
}
