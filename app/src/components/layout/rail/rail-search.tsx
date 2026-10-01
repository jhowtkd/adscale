"use client";

// "Buscar" in the rail has no screen of its own (no new route): it focuses the search field of the page you are on
// (the conversation list, the Library filters). Where the page has none (Ideias, Metas) it leads to the conversation
// and focuses the field there. A page offers its field with `useRailSearchTarget`.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";

type RailSearch = { register: (element: HTMLInputElement | null) => void; request: () => void };

const RailSearchContext = createContext<RailSearch | null>(null);

/** A request that finds no field waits this long for the next page to offer one. */
const PENDING_WINDOW_MS = 4_000;

export function RailSearchProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const target = useRef<HTMLInputElement | null>(null);
  const pendingSince = useRef<number | null>(null);

  const register = useCallback((element: HTMLInputElement | null) => {
    target.current = element;
    if (element && pendingSince.current !== null) {
      const fresh = Date.now() - pendingSince.current < PENDING_WINDOW_MS;
      pendingSince.current = null;
      if (fresh) element.focus();
    }
  }, []);

  const request = useCallback(() => {
    const field = target.current;
    if (field && field.isConnected) {
      field.focus();
      return;
    }
    pendingSince.current = Date.now();
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  const value = useMemo(() => ({ register, request }), [register, request]);
  return <RailSearchContext.Provider value={value}>{children}</RailSearchContext.Provider>;
}

export function useRailSearch(): RailSearch | null {
  return useContext(RailSearchContext);
}

/** Offers a search field to the rail's "Buscar". Outside the rail shell it does nothing. */
export function useRailSearchTarget(ref: RefObject<HTMLInputElement | null>) {
  const rail = useRailSearch();
  useEffect(() => {
    if (!rail) return;
    rail.register(ref.current);
    return () => rail.register(null);
  }, [rail, ref]);
}
