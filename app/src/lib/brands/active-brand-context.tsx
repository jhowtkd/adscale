"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/store";
import { writeActiveBrandCookie, type ActiveBrand } from "./active-brand";

/** Undefined where no provider is mounted (the rail shell mounts it for every dashboard route): the reader then keeps the store's own choice. */
const ActiveBrandContext = createContext<ActiveBrand | null | undefined>(undefined);

export function ActiveBrandProvider({ brand, children }: { brand: ActiveBrand | null; children: ReactNode }) {
  const select = useAppStore((state) => state.setActiveClientProfileId);
  const queryClient = useQueryClient();
  const shown = useRef(brand?.id);
  const brandId = brand?.id;
  // The composer and every screen that reads the store follow the brand object the server rendered. A new object
  // only arrives with a server render, so a switch the server refused heals when it answers. The store is read here, not
  // subscribed, so a switch is not pinned back to the stale prop before the server answers.
  useEffect(() => {
    if (brand && useAppStore.getState().activeClientProfileId !== brand.id) select(brand.id);
  }, [brand, select]);
  // The server opens a brand's account on its first visit. Once the rail shows another brand, the cached account list
  // (kept for a minute) is read again, so the screens find that account.
  useEffect(() => {
    if (shown.current === brandId) return;
    shown.current = brandId;
    void queryClient.invalidateQueries({ queryKey: ["equipe"] });
  }, [brandId, queryClient]);
  return <ActiveBrandContext.Provider value={brand}>{children}</ActiveBrandContext.Provider>;
}

/**
 * Rendered by the home when its opening created the workspace's first brand. The (dashboard) layout read the brand before
 * that brand existed, so the rail has none; one refresh renders the layout again, and the rail shows it.
 */
export function RefreshForFirstBrand(): null {
  const router = useRouter();
  const refreshed = useRef(false);
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [router]);
  return null;
}

/** The rail's brand (spec 2026-10-07 §3): null for a workspace with no brand yet, undefined outside the rail shell. */
export function useActiveBrand(): ActiveBrand | null | undefined {
  return useContext(ActiveBrandContext);
}

/**
 * Switches the active brand: the cookie for the server, the store for the composer, then the brand's own conversation.
 * The same screen is rendered again instead when the person is already on the conversation, or when a link to another
 * brand's account brought them where they are.
 *
 * Off the conversation, the push is followed by a refresh. A push to "/" does not re-render the shared (dashboard) layout
 * that keeps on client navigation, and that layout feeds the rail's brand; the refresh re-renders it with the new cookie.
 */
export function useSwitchActiveBrand(): (clientProfileId: string, options?: { stay?: boolean }) => void {
  const router = useRouter();
  const select = useAppStore((state) => state.setActiveClientProfileId);
  return useCallback((clientProfileId: string, options?: { stay?: boolean }) => {
    writeActiveBrandCookie(clientProfileId);
    select(clientProfileId);
    // Read at the click, not through usePathname: this hook runs inside every screen's account selection, and their
    // tests mock next/navigation with the router alone.
    if (options?.stay || window.location.pathname === "/") {
      router.refresh();
      return;
    }
    router.push("/");
    router.refresh();
  }, [router, select]);
}
