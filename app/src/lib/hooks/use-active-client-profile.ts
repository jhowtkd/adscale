"use client";

import { useCallback, useEffect, useRef } from "react";
import { useActiveBrand, useSwitchActiveBrand } from "@/lib/brands/active-brand-context";
import { useAppStore } from "@/lib/store";
import {
  useClientProfiles,
  type ClientProfile,
} from "@/lib/hooks/use-client-profiles";

export type ActiveClientProfileState = {
  profiles: ClientProfile[];
  activeProfile: ClientProfile | null;
  activeClientProfileId: string | null;
  requiresSelection: boolean;
  isLoading: boolean;
  isError: boolean;
  selectProfile: (profileId: string) => void;
};

/**
 * The brand the screens work on. Every dashboard route is inside the rail shell (spec 2026-10-07 §3), where the rail's
 * brand is the only truth: the composer, the Brand Kit and the brand training follow it, and choosing a brand switches
 * the rail's brand (cookie, store and a server render) instead of writing the store alone, which only the next server
 * render would have brought back in line. Without the rail's provider (a screen rendered on its own, as in its tests) it
 * is the store's choice, healed against the workspace's brands.
 */
export function useActiveClientProfile(): ActiveClientProfileState {
  const { data: profiles = [], isLoading, isError, isSuccess } = useClientProfiles();
  const persistedId = useAppStore((state) => state.activeClientProfileId);
  const setStoredProfile = useAppStore((state) => state.setActiveClientProfileId);
  const railBrand = useActiveBrand();
  const switchBrand = useSwitchActiveBrand();
  const inRail = railBrand !== undefined;
  const railBrandId = railBrand?.id ?? null;
  const validPersistedId = profiles.some((profile) => profile.id === persistedId)
    ? persistedId
    : null;
  const activeClientProfileId = inRail
    ? railBrandId
    : profiles.length === 1 ? profiles[0].id : validPersistedId;

  // The rail's provider already keeps the store on the rail's brand, and it does so without pinning a switch back to
  // the stale brand before the server answers; this heal is only for a screen rendered without that provider.
  useEffect(() => {
    if (inRail || !isSuccess || persistedId === activeClientProfileId) return;
    setStoredProfile(activeClientProfileId);
  }, [activeClientProfileId, inRail, isSuccess, persistedId, setStoredProfile]);

  // The brand a switch was asked for, and the rail brand it was asked from. The server may keep the old brand (the free
  // plan stays on its account's brand), so a caller that selects again in an effect would refresh the page forever.
  // Asking again for the same brand from the same rail brand does nothing; once the rail's brand changes, it is a new ask.
  const asked = useRef<{ id: string; from: string | null } | null>(null);
  const selectInRail = useCallback((profileId: string) => {
    if (profileId === railBrandId) return;
    if (asked.current?.id === profileId && asked.current.from === railBrandId) return;
    asked.current = { id: profileId, from: railBrandId };
    switchBrand(profileId, { stay: true });
  }, [railBrandId, switchBrand]);

  return {
    profiles,
    activeProfile:
      profiles.find((profile) => profile.id === activeClientProfileId) ?? null,
    activeClientProfileId,
    requiresSelection: !isLoading && profiles.length > 1 && !activeClientProfileId,
    isLoading,
    isError,
    selectProfile: inRail ? selectInRail : setStoredProfile,
  };
}
