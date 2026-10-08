"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { writeActiveBrandCookie, type ActiveBrand } from "./active-brand";

/** Undefined outside the rail shell: the classic shell has no active brand of its own (it keeps the composer's switcher). */
const ActiveBrandContext = createContext<ActiveBrand | null | undefined>(undefined);

export function ActiveBrandProvider({ brand, children }: { brand: ActiveBrand | null; children: ReactNode }) {
  const select = useAppStore((state) => state.setActiveClientProfileId);
  const queryClient = useQueryClient();
  const shown = useRef(brand?.id);
  const brandId = brand?.id;
  // The composer and the classic screens read the store: they follow the brand the server rendered. Only a change of
  // that brand syncs it; depending on the store value too would pin a switch back to the stale prop before the server
  // answers.
  useEffect(() => {
    if (brandId) select(brandId);
  }, [brandId, select]);
  // The server opens a brand's account on its first visit. Once the rail shows another brand, the cached account list
  // (kept for a minute) is read again, so the screens find that account.
  useEffect(() => {
    if (shown.current === brandId) return;
    shown.current = brandId;
    void queryClient.invalidateQueries({ queryKey: ["equipe"] });
  }, [brandId, queryClient]);
  return <ActiveBrandContext.Provider value={brand}>{children}</ActiveBrandContext.Provider>;
}

/** The rail's brand (spec 2026-10-07 §3): null for a workspace with no brand yet, undefined outside the rail shell. */
export function useActiveBrand(): ActiveBrand | null | undefined {
  return useContext(ActiveBrandContext);
}

/**
 * Switches the active brand: the cookie for the server, the store for the composer, then the brand's own conversation.
 * The same screen is rendered again instead when the person is already on the conversation, or when a link to another
 * brand's account brought them where they are.
 */
export function useSwitchActiveBrand(): (clientProfileId: string, options?: { stay?: boolean }) => void {
  const router = useRouter();
  const select = useAppStore((state) => state.setActiveClientProfileId);
  return useCallback((clientProfileId: string, options?: { stay?: boolean }) => {
    writeActiveBrandCookie(clientProfileId);
    select(clientProfileId);
    // Read at the click, not through usePathname: this hook runs inside every screen's account selection, and their
    // tests mock next/navigation with the router alone.
    if (options?.stay || window.location.pathname === "/") router.refresh();
    else router.push("/");
  }, [router, select]);
}
