"use client"

import { useSyncExternalStore } from "react"

const QUERY = "(prefers-reduced-motion: reduce)"

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {}

  const mediaQuery = window.matchMedia(QUERY)
  mediaQuery.addEventListener("change", onStoreChange)
  return () => mediaQuery.removeEventListener("change", onStoreChange)
}

function getSnapshot() {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia(QUERY).matches
    : false
}

function getServerSnapshot() {
  return false
}

/**
 * Hook to detect user's reduced motion preference
 * Returns true if user prefers reduced motion
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
